/**
 * Depth Controller — non-LLM decision node.
 *
 * After the research node completes, decides whether to continue
 * researching (route to research_dispatcher) or synthesize (route to
 * synthesis). Adds new sub-questions to the research tree and enforces
 * depth limits. Exact-match deduplication of question text.
 *
 * Domain-agnostic: no legal-specific logic.
 *
 * See: PRD §4.1 — depth_controller
 */
import { randomUUID } from 'crypto';
import type {
  LegalResearchState,
  ResearchTreeNode,
} from '../legal-research.state';
import type { ObservabilityService } from '../../../../shared/services/observability.service';

export type DepthControllerRouting = 'research_dispatcher' | 'synthesis';

export function createDepthControllerNode(observability: ObservabilityService) {
  return async function depthControllerNode(
    state: LegalResearchState,
  ): Promise<Partial<LegalResearchState>> {
    const ctx = state.executionContext;
    const config = state.researchConfig;

    // Handle deepen action from HITL: add sub-questions at target nodes
    if (state.hitlAction?.type === 'deepen') {
      const { targetNodeIds, guidance } = state.hitlAction;
      const tree = [...state.researchTree.map((n) => ({ ...n }))];
      const newPending: string[] = [];

      for (const targetId of targetNodeIds) {
        const targetNode = tree.find((n) => n.id === targetId);
        if (!targetNode) continue;

        // Create a "deepen" sub-question under the target
        const deepenQuestion = guidance
          ? `Further research on: ${targetNode.question} — Guidance: ${guidance}`
          : `Further research on: ${targetNode.question}`;

        const childId = randomUUID();
        targetNode.childIds.push(childId);
        const newNode: ResearchTreeNode = {
          id: childId,
          parentId: targetId,
          question: deepenQuestion,
          depth: targetNode.depth + 1,
          status: 'pending',
          childIds: [],
        };
        tree.push(newNode);
        newPending.push(childId);
      }

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Deepen: added ${newPending.length} new sub-questions at ${targetNodeIds.length} target nodes`,
        { step: 'lr_depth_deepen', progress: 40 },
      );

      return {
        researchTree: tree,
        pendingQuestions: newPending,
        hitlAction: undefined, // clear the action
      };
    }

    // Normal depth control: decide whether to continue or synthesize
    const targetId = state.currentResearchTarget;
    const targetNode = state.researchTree.find((n) => n.id === targetId);
    const currentDepth = targetNode?.depth ?? state.currentDepth;

    // pendingQuestions here contains the new sub-questions from the research node
    // (temporarily stored there — not the same as the dispatch queue)
    const newSubQuestions = state.pendingQuestions;

    // Collect all existing questions for deduplication
    const existingQuestions = new Set(
      state.researchTree.map((n) => n.question),
    );

    // Filter out duplicate sub-questions (exact match)
    const uniqueSubQuestions = newSubQuestions.filter(
      (q) => !existingQuestions.has(q),
    );

    // Check budget and depth constraints
    const depthExceeded = currentDepth >= config.maxDepth;
    const allHighConfidence =
      targetNode?.confidence === 'high' && uniqueSubQuestions.length === 0;
    const tokenBudgetExceeded =
      config.tokenBudget !== null &&
      state.tokenUsage.input + state.tokenUsage.output >= config.tokenBudget;
    const timeBudgetExceeded =
      config.timeBudgetMs !== null &&
      Date.now() - state.startedAt >= config.timeBudgetMs;

    const shouldSynthesize =
      depthExceeded ||
      allHighConfidence ||
      tokenBudgetExceeded ||
      timeBudgetExceeded ||
      uniqueSubQuestions.length === 0;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      shouldSynthesize
        ? 'Depth controller: routing to synthesis'
        : `Depth controller: ${uniqueSubQuestions.length} new sub-questions, continuing research`,
      {
        step: 'lr_depth_controller',
        progress: shouldSynthesize ? 50 : 30,
        currentDepth,
        maxDepth: config.maxDepth,
        tokensUsed: state.tokenUsage.input + state.tokenUsage.output,
        tokenBudget: config.tokenBudget,
        elapsedMs: Date.now() - state.startedAt,
        timeBudgetMs: config.timeBudgetMs,
        pendingCount: uniqueSubQuestions.length,
        completedCount: state.researchTree.filter(
          (n) => n.status === 'answered',
        ).length,
        decision: shouldSynthesize ? 'synthesis' : 'continue',
      },
    );

    if (shouldSynthesize) {
      // Mark any remaining pending sub-questions in the tree as skipped
      // if budget/depth forced early synthesis
      let tree = state.researchTree;
      if (depthExceeded || tokenBudgetExceeded || timeBudgetExceeded) {
        tree = tree.map((n) =>
          n.status === 'pending' ? { ...n, status: 'skipped' as const } : n,
        );
      }
      return {
        researchTree: tree,
        pendingQuestions: [],
        currentResearchTarget: undefined,
      };
    }

    // Add new sub-questions to the tree
    const tree = [...state.researchTree.map((n) => ({ ...n }))];
    const parentNode = tree.find((n) => n.id === targetId);
    const newPending: string[] = [];

    for (const question of uniqueSubQuestions) {
      const childId = randomUUID();
      if (parentNode) {
        parentNode.childIds.push(childId);
      }
      const newNode: ResearchTreeNode = {
        id: childId,
        parentId: targetId ?? null,
        question,
        depth: currentDepth + 1,
        status: 'pending',
        childIds: [],
      };
      tree.push(newNode);
      newPending.push(childId);
    }

    return {
      researchTree: tree,
      pendingQuestions: newPending,
      currentDepth: currentDepth + 1,
      currentResearchTarget: undefined,
    };
  };
}
