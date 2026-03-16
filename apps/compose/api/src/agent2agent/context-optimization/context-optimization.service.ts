import { Injectable, Logger } from '@nestjs/common';
import { AgentConversationsService } from '../conversations/agent-conversations.service';
import { DeliverablesService } from '../deliverables/deliverables.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Represents a single message in a conversation history.
 * Used for context optimization processing.
 */
export interface ConversationMessage {
  /** The role of the message sender (e.g., 'system', 'user', 'assistant') */
  role: string;
  /** The actual content of the message */
  content: string;
  /** ISO timestamp when the message was created */
  timestamp: string;
  /** Optional metadata associated with the message */
  metadata?: Record<string, unknown>;
}

/**
 * Context Optimization Service
 *
 * Optimizes conversation context to fit within token budgets while preserving
 * the most relevant information. Uses a layered optimization approach:
 *
 * 1. Fast-path: If under 80% of budget, pass through unchanged
 * 2. Extract essential context from work products (deliverables, etc.)
 * 3. Score messages by relevance using multiple heuristics
 * 4. Select optimal window of messages within budget
 *
 * The service emits metrics for monitoring optimization performance.
 *
 * @example
 * ```typescript
 * const optimized = await service.optimizeContext({
 *   fullHistory: messages,
 *   conversationId: 'conv-123',
 *   tokenBudget: 4000
 * });
 * ```
 */
@Injectable()
export class ContextOptimizationService {
  private readonly logger = new Logger(ContextOptimizationService.name);

  constructor(
    private readonly agentConversationsService: AgentConversationsService,
    private readonly deliverablesService: DeliverablesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Optimizes conversation context to fit within a token budget.
   *
   * Algorithm:
   * 1. Fast-path check: If total tokens <= 80% of budget, return unchanged
   * 2. Otherwise, perform layered optimization:
   *    - Extract work product context (deliverables, etc.) for relevance scoring
   *    - Score each message by relevance (role, recency, keyword overlap)
   *    - Select highest-scoring messages that fit within budget
   *    - Ensure first and last messages are included when possible
   *
   * Emits 'context_optimization.metrics' event with performance data.
   *
   * @param request - Optimization request parameters
   * @param request.fullHistory - Complete conversation history to optimize
   * @param request.conversationId - Optional conversation ID for context
   * @param request.workProductType - Type of work product ('deliverable')
   * @param request.workProductId - ID of work product for context extraction
   * @param request.tokenBudget - Maximum tokens allowed in result
   * @returns Optimized message array fitting within token budget
   *
   * @throws Never throws - errors are logged and metrics emission is optional
   *
   * @example
   * ```typescript
   * const optimized = await optimizeContext({
   *   fullHistory: conversationMessages,
   *   workProductType: 'deliverable',
   *   workProductId: 'deliv-123',
   *   tokenBudget: 4000
   * });
   * // Returns subset of messages with highest relevance scores
   * ```
   *
   * Time Complexity: O(n log n) where n = message count (due to sorting)
   * Space Complexity: O(n) for scored message array
   */
  async optimizeContext(request: {
    fullHistory: ConversationMessage[];
    conversationId?: string;
    workProductType?: 'deliverable';
    workProductId?: string;
    tokenBudget: number;
  }): Promise<ConversationMessage[]> {
    const { fullHistory, tokenBudget } = request;

    const start = Date.now();

    // Fast-path: under 80% of budget → pass through
    const totalTokens = this.calculateTokens(fullHistory);
    if (totalTokens <= tokenBudget * 0.8) {
      return fullHistory;
    }

    // Layered optimization
    const optimized = await this.performLayeredOptimization(request);
    const duration = Date.now() - start;

    // Emit metrics
    try {
      this.eventEmitter.emit('context_optimization.metrics', {
        originalCount: fullHistory.length,
        optimizedCount: optimized.length,
        processingTimeMs: duration,
        workProductType: request.workProductType,
      });
    } catch (error) {
      this.logger.warn('Failed to emit context optimization metrics', error);
    }
    return optimized;
  }

  /**
   * Performs layered optimization using work product context and message scoring.
   *
   * Steps:
   * 1. Extract essential context from work product (if specified)
   * 2. Score all messages based on relevance heuristics
   * 3. Select optimal window of messages within token budget
   *
   * @param request - Same parameters as optimizeContext
   * @returns Optimized message array
   *
   * Time Complexity: O(n log n) - dominated by sorting in selectOptimalWindow
   */
  private async performLayeredOptimization(request: {
    fullHistory: ConversationMessage[];
    workProductType?: 'deliverable';
    workProductId?: string;
    tokenBudget: number;
  }): Promise<ConversationMessage[]> {
    const essentialContext: unknown = await this.extractWorkProductContext(
      request.workProductType,
      request.workProductId,
    );

    const scored = this.scoreMessageRelevance(
      request.fullHistory,
      essentialContext,
    );

    return this.selectOptimalWindow(scored, request.tokenBudget);
  }

  /**
   * Extracts contextual information from work products to aid relevance scoring.
   *
   * Loads the specified work product (e.g., deliverable) to extract keywords
   * and context that can be used to score message relevance.
   *
   * @param type - Type of work product ('deliverable')
   * @param id - ID of the work product
   * @returns Work product data or null if unavailable
   *
   * Edge Cases:
   * - Returns null if type or id is missing
   * - Returns null if work product cannot be loaded (logs warning)
   * - Uses dummy userId for read-only access (TODO: pass real userId)
   *
   * Time Complexity: O(1) - single database query
   */
  private async extractWorkProductContext(
    type?: 'deliverable',
    id?: string,
  ): Promise<unknown> {
    if (!type || !id) return null;

    try {
      if (type === 'deliverable') {
        // Read-only context; implement as needed (userId required in real impl)
        return await this.deliverablesService.findOne(
          id,
          '00000000-0000-0000-0000-000000000000',
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to load ${type ?? 'unknown'} context for ${id ?? 'unknown id'}`,
        error,
      );
    }
    return null;
  }

  /**
   * Scores each message by relevance using multiple heuristics.
   *
   * Scoring Algorithm:
   * - Base score: 1
   * - Role bonus: +2 for system messages, +1 for assistant messages
   * - Context overlap: +0 to +3 based on keyword overlap with work product
   * - Recency bonus: +0 to +3 based on position (recent messages scored higher)
   *
   * The recency bonus increases by 1 for every 5 messages from the end,
   * capped at +3. This ensures recent context is weighted appropriately.
   *
   * @param messages - All messages to score
   * @param essentialContext - Work product context for keyword matching
   * @returns Array of scored messages with token counts
   *
   * Edge Cases:
   * - Empty messages array returns empty array
   * - Null essentialContext skips overlap scoring
   * - Empty message content scores with role and recency only
   *
   * Time Complexity: O(n * m) where n = message count, m = avg message length
   * Space Complexity: O(n) for scored array
   */
  private scoreMessageRelevance(
    messages: ConversationMessage[],
    essentialContext: unknown,
  ): Array<{ message: ConversationMessage; score: number; tokens: number }> {
    return messages.map((m, idx) => {
      const tokens = this.estimateTokens(m);
      let score = 1;

      // Simple heuristics; can be upgraded later
      if (m.role === 'system') score += 2;
      if (m.role === 'assistant') score += 1;
      if (essentialContext) {
        const hint = JSON.stringify(essentialContext).slice(0, 1024);
        if (m.content && hint && m.content.length > 0) {
          const overlap = this.keywordOverlap(m.content, hint);
          score += overlap;
        }
      }

      // Boost recent messages
      score += Math.min(3, Math.floor((messages.length - idx) / 5));

      return { message: m, score, tokens };
    });
  }

  /**
   * Selects optimal window of messages within token budget using greedy algorithm.
   *
   * Selection Algorithm:
   * 1. Sort messages by score (descending) while preserving original indices
   * 2. Greedily select highest-scoring messages until budget is 95% full
   * 3. Add first and last messages if not already selected and budget allows
   * 4. Return messages in original chronological order
   *
   * The 95% threshold prevents over-packing and leaves room for system overhead.
   * Boundary messages (first/last) are prioritized to maintain conversation flow.
   *
   * @param scored - Messages with scores and token counts
   * @param tokenBudget - Maximum tokens allowed
   * @returns Selected messages in original order
   *
   * Edge Cases:
   * - Empty scored array returns empty array
   * - If no messages fit budget, returns as many boundary messages as possible
   * - Single message always returned if it fits budget
   *
   * Example:
   * ```typescript
   * // Given messages [A, B, C, D, E] with scores [5, 2, 8, 1, 6]
   * // and tokenBudget = 1000
   * // Selection order by score: C(8), E(6), A(5), B(2), D(1)
   * // Returns in original order: [A, C, E] (assuming they fit)
   * ```
   *
   * Time Complexity: O(n log n) - dominated by sorting
   * Space Complexity: O(n) - for index set and reconstruction
   */
  private selectOptimalWindow(
    scored: Array<{
      message: ConversationMessage;
      score: number;
      tokens: number;
    }>,
    tokenBudget: number,
  ): ConversationMessage[] {
    // Sort by score desc, maintain order via stable mapping
    const ranked = scored
      .map((s, i) => ({ ...s, idx: i }))
      .sort((a, b) => b.score - a.score);

    const selectedIdx = new Set<number>();
    let used = 0;
    for (const item of ranked) {
      if (used + item.tokens > tokenBudget) continue;
      selectedIdx.add(item.idx);
      used += item.tokens;
      if (used >= tokenBudget * 0.95) break;
    }

    // Always try to include first and last user/assistant turns if possible
    const boundaryCandidates = [0, scored.length - 1].filter((x) => x >= 0);
    for (const idx of boundaryCandidates) {
      const item = scored[idx];
      if (!item) continue;
      if (!selectedIdx.has(idx) && used + item.tokens <= tokenBudget) {
        selectedIdx.add(idx);
        used += item.tokens;
      }
    }

    // Reconstruct in original order
    return scored
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => selectedIdx.has(i))
      .sort((a, b) => a.i - b.i)
      .map(({ s }) => s.message);
  }

  /**
   * Calculates total token count for an array of messages.
   *
   * @param messages - Messages to count tokens for
   * @returns Total estimated token count
   *
   * Time Complexity: O(n) where n = message count
   */
  private calculateTokens(messages: ConversationMessage[]): number {
    return messages.reduce((acc, m) => acc + this.estimateTokens(m), 0);
  }

  /**
   * Estimates token count for a single message using heuristics.
   *
   * Token Estimation:
   * - Content tokens: message length / 4 (rough approximation)
   * - Metadata tokens: JSON length / 8, capped at 128
   *
   * This is a fast heuristic, not precise tokenization. Actual token counts
   * may vary by ~20% depending on content complexity.
   *
   * @param m - Message to estimate tokens for
   * @returns Estimated token count
   *
   * Time Complexity: O(m) where m = message content length
   */
  private estimateTokens(m: ConversationMessage): number {
    // Cheap heuristics: ~4 chars per token
    const contentTokens = Math.ceil((m.content || '').length / 4);
    const metaTokens = m.metadata
      ? Math.min(128, JSON.stringify(m.metadata).length / 8)
      : 0;
    return contentTokens + Math.ceil(metaTokens);
  }

  /**
   * Calculates keyword overlap between two text strings.
   *
   * Algorithm:
   * 1. Normalize both strings to lowercase
   * 2. Remove non-alphanumeric characters
   * 3. Split into word sets
   * 4. Count common words
   * 5. Return overlap score capped at 3 (overlap / 5)
   *
   * @param a - First text string
   * @param b - Second text string
   * @returns Overlap score from 0 to 3
   *
   * Example:
   * ```typescript
   * keywordOverlap(
   *   "Create a new deliverable for the project",
   *   "deliverable project requirements"
   * );
   * // Returns ~0.4 (2 common words: 'deliverable', 'project')
   * ```
   *
   * Time Complexity: O(n + m) where n, m = string lengths
   */
  private keywordOverlap(a: string, b: string): number {
    const as = new Set(
      a
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean),
    );
    const bs = new Set(
      b
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean),
    );
    let overlap = 0;
    for (const w of as) if (bs.has(w)) overlap++;
    return Math.min(3, overlap / 5); // cap contribution
  }
}
