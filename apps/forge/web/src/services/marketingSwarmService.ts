/**
 * Marketing Swarm Service
 *
 * Handles all async operations for the Marketing Swarm feature:
 * - Fetching configuration data (content types, agents, LLM configs)
 * - Starting swarm executions via POST /invoke/stream (invoke contract)
 * - Real-time progress via observability SSE stream
 * - Fetching results
 *
 * Executions go through the invoke contract (POST /invoke/stream) which
 * routes to MarketingSwarmCapability via the CapabilityRegistryService.
 */

import { apiService } from './apiService';
import { useMarketingSwarmStore } from '@/stores/marketingSwarmStore';
import { authenticatedFetch, triggerReLogin } from './utils/authenticatedFetch';
import { getSecureApiBaseUrl } from '@/utils/securityConfig';
import { invokeStream as invokeStreamClient } from './invoke-client';
import type { StreamEvent } from '@orchestrator-ai/transport-types';

/**
 * Get auth token from storage
 * TokenStorageService migrates tokens from localStorage to sessionStorage,
 * so we check sessionStorage first, then fall back to localStorage
 * @deprecated Use authenticatedFetch instead for automatic token refresh
 */
function getAuthToken(): string | null {
  return sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
}
import agent2AgentConversationsService from './agent2AgentConversationsService';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import { useConversationsStore } from '@/stores/conversationsStore';
import type {
  MarketingContentType,
  MarketingAgent,
  SwarmConfigurationResponse,
  SwarmTaskResponse,
  SwarmStatusResponse,
  SwarmStateResponse,
  PromptData,
  SwarmConfig,
  ObservabilityEvent,
  PhaseChangedMetadata,
  QueueBuiltMetadata,
  OutputUpdatedMetadata,
  EvaluationUpdatedMetadata,
  FinalistsSelectedMetadata,
  RankingUpdatedMetadata,
  SSEMetadataPhase2,
  OutputVersionsResponse,
} from '@/types/marketing-swarm';
import { SSEClient } from './sseClient';

// API base URL - uses getSecureApiBaseUrl() for correct URL in all environments
// In dev mode, returns '' (empty string) so requests go through Vite proxy.
// LangGraph workflows are now served by the unified API
const API_BASE_URL = getSecureApiBaseUrl();

/**
 * Raw snake_case output record as returned from the /marketing-swarm/state API
 */
interface RawApiOutput {
  id: string;
  status?: string;
  writer_agent_slug: string;
  writer_llm_provider?: string;
  writer_llm_model?: string;
  editor_agent_slug?: string;
  editor_llm_provider?: string;
  editor_llm_model?: string;
  content?: string;
  edit_cycle?: number;
  editor_feedback?: string;
  initial_avg_score?: number | null;
  initial_rank?: number | null;
  is_finalist?: boolean;
  final_total_score?: number | null;
  final_rank?: number | null;
  llm_metadata?: {
    tokensUsed?: number;
    cost?: number;
    totalLatencyMs?: number;
    llmCallCount?: number;
    lastLatencyMs?: number;
  };
}

/**
 * Raw snake_case evaluation record as returned from the /marketing-swarm/state API
 */
interface RawApiEvaluation {
  id: string;
  output_id: string;
  evaluator_agent_slug: string;
  evaluator_llm_provider?: string;
  evaluator_llm_model?: string;
  stage: 'initial' | 'final';
  status: string;
  score?: number | null;
  reasoning?: string;
  rank?: number | null;
  weighted_score?: number | null;
  llm_metadata?: {
    tokensUsed?: number;
    latencyMs?: number;
    cost?: number;
  };
}

class MarketingSwarmService {
  private sseClient: SSEClient | null = null;
  private sseCleanup: (() => void)[] = [];
  /**
   * Fetch LLM configurations for a specific agent
   */
  async getAgentLLMConfigs(agentSlug: string): Promise<Array<{
    llmProvider: string;
    llmModel: string;
    displayName: string | null;
    isDefault: boolean;
    isLocal: boolean;
  }>> {
    try {
      const response = await apiService.get<Array<{
        llmProvider: string;
        llmModel: string;
        displayName: string | null;
        isDefault: boolean;
        isLocal: boolean;
      }>>(`/marketing/agents/${agentSlug}/llm-configs`);
      return response;
    } catch (error) {
      console.error(`Failed to fetch LLM configs for agent ${agentSlug}:`, error);
      throw error;
    }
  }

  /**
   * Fetch all configuration data in a single request
   * Uses the /api/marketing/config endpoint which returns all data efficiently
   *
   * Note: LLM models are now fetched separately from /llm/models endpoint.
   * The frontend sends llmProvider/llmModel selections directly in the config.
   */
  async fetchAllConfiguration(_orgSlug: string): Promise<void> {
    const store = useMarketingSwarmStore();
    store.setLoading(true);
    store.clearError();

    try {
      // Single API call that returns all configuration
      const response = await apiService.get<SwarmConfigurationResponse>(
        '/marketing/config'
      );

      // Set content types
      store.setContentTypes(response.contentTypes);

      // Flatten agents from the grouped response
      const allAgents: MarketingAgent[] = [
        ...response.writers,
        ...response.editors,
        ...response.evaluators,
      ];
      store.setAgents(allAgents);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch configuration';
      store.setError(message);
      throw error;
    } finally {
      store.setLoading(false);
    }
  }

  /**
   * Fetch all content types
   */
  async fetchContentTypes(): Promise<MarketingContentType[]> {
    const store = useMarketingSwarmStore();

    try {
      const response = await apiService.get<MarketingContentType[]>(
        '/marketing/content-types'
      );
      store.setContentTypes(response);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch content types';
      store.setError(message);
      throw error;
    }
  }

  /**
   * Fetch all marketing agents
   */
  async fetchAgents(): Promise<MarketingAgent[]> {
    const store = useMarketingSwarmStore();

    try {
      const response = await apiService.get<MarketingAgent[]>(
        '/marketing/agents'
      );
      store.setAgents(response);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch agents';
      store.setError(message);
      throw error;
    }
  }

  // Note: fetchAgentLLMConfigs was removed - LLM models are now fetched
  // from /llm/models endpoint and selected directly in the UI

  /**
   * Create a new conversation for the Marketing Swarm
   *
   * This follows the same pattern as normal conversations:
   * 1. Creates conversation in database via agent2AgentConversationsService
   * 2. Initializes executionContextStore with the context
   *
   * @returns The conversation ID
   */
  async createSwarmConversation(
    orgSlug: string,
    userId: string,
    config: SwarmConfig
  ): Promise<string> {
    // Generate conversation ID upfront
    const conversationId = crypto.randomUUID();

    // Create conversation in database (same as normal conversations)
    await agent2AgentConversationsService.createConversation({
      agentName: 'marketing-swarm',
      agentType: 'api',
      organizationSlug: orgSlug,
      conversationId,
      metadata: {
        source: 'marketing-swarm-ui',
        contentType: 'marketing-content',
      },
    });

    // Initialize ExecutionContext (same as normal conversations)
    const executionContextStore = useExecutionContextStore();
    executionContextStore.initialize({
      orgSlug,
      userId,
      conversationId,
      agentSlug: 'marketing-swarm',
      agentType: 'api',
      provider: config.writers[0]?.llmProvider || 'anthropic',
      model: config.writers[0]?.llmModel || 'claude-sonnet-4-20250514',
    });

    return conversationId;
  }

  /**
   * Initialize ExecutionContext with an existing conversation
   *
   * Used when the conversation was already created by AgentsPage (via conversationHelpers)
   * and passed to the Marketing Swarm page via route query.
   */
  initializeWithExistingConversation(
    conversationId: string,
    orgSlug: string,
    userId: string,
    config: SwarmConfig
  ): void {
    const executionContextStore = useExecutionContextStore();
    executionContextStore.initialize({
      orgSlug,
      userId,
      conversationId,
      agentSlug: 'marketing-swarm',
      agentType: 'api',
      provider: config.writers[0]?.llmProvider || 'anthropic',
      model: config.writers[0]?.llmModel || 'claude-sonnet-4-20250514',
    });
  }

  /**
   * Start a new swarm execution via the invoke contract
   *
   * Uses POST /invoke/stream (JSON-RPC 2.0) to start the marketing swarm.
   * The streaming connection keeps alive to avoid proxy timeouts on this
   * long-running workflow. Real-time progress is delivered via the separate
   * observability SSE stream (connectToSSEStream).
   *
   * Flow:
   * 1. ExecutionContext must be initialized (via createSwarmConversation or initializeWithExistingConversation)
   * 2. POST /invoke/stream with { context, data: { content: swarmConfig, contentType: "json" } }
   * 3. Backend routes to MarketingSwarmCapability via CapabilityRegistryService
   * 4. SSE observability stream delivers real-time progress updates
   * 5. When streaming completes, the final result is available
   */
  async startSwarmExecution(
    contentTypeSlug: string,
    contentTypeContext: string,
    promptData: PromptData,
    config: SwarmConfig
  ): Promise<SwarmTaskResponse> {
    const store = useMarketingSwarmStore();
    store.setExecuting(true);
    store.clearError();
    store.setUIView('progress');

    try {
      // Verify ExecutionContext is initialized
      const executionContextStore = useExecutionContextStore();
      if (!executionContextStore.isInitialized) {
        throw new Error('ExecutionContext not initialized. Call createSwarmConversation first.');
      }

      const ctx = executionContextStore.current;

      console.log('[MarketingSwarm] Starting execution via invoke contract', {
        conversationId: ctx.conversationId,
        agentSlug: ctx.agentSlug,
      });

      // Ensure execution config is present (required by backend)
      const configWithExecution = {
        ...config,
        execution: config.execution || {
          maxLocalConcurrent: 1,
          maxCloudConcurrent: 5,
          maxEditCycles: config.maxEditCycles || 2,
          topNForFinalRanking: 1,
        },
      };

      // Build the invoke data payload
      const invokeContent = {
        type: 'marketing-swarm-request',
        contentTypeSlug,
        contentTypeContext,
        promptData,
        config: configWithExecution,
      };

      // Use invokeStream to keep the HTTP connection alive and avoid
      // Cloudflare 524 timeouts on this long-running workflow.
      // Real-time progress is delivered via the separate observability SSE stream.
      const taskId = ctx.conversationId; // Marketing swarm uses conversationId as taskId

      const taskResponse: SwarmTaskResponse = {
        taskId,
        status: 'running',
        outputs: [],
        evaluations: [],
        rankedResults: [],
      };

      const token = getAuthToken() || '';

      const { abort } = invokeStreamClient(
        ctx,
        { content: invokeContent, contentType: 'json' },
        { baseUrl: API_BASE_URL, token },
        (event: StreamEvent) => {
          console.log('[MarketingSwarm] Stream event:', event.event);

          if (event.event === 'error') {
            const errorData = event.data as { message?: string } | undefined;
            const errorMsg = errorData?.message || 'Swarm execution failed';
            store.setError(errorMsg);
            store.setExecuting(false);
          }
          // 'output' and 'completed' events are handled here for final results,
          // but real-time progress comes via the observability SSE stream
          if (event.event === 'completed') {
            console.log('[MarketingSwarm] Invoke stream completed');
            // SSE observability events handle the final state transition
          }
        },
      );

      // Store the abort handle so we can cancel if needed
      store.setCurrentTaskId(taskId);
      this._invokeAbort = abort;

      console.log('[MarketingSwarm] Execution started via invoke/stream, waiting for SSE updates...');

      return taskResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Swarm execution failed';
      store.setError(message);
      store.setExecuting(false);
      throw error;
    }
    // Note: Don't set executing(false) in finally block - let SSE events control execution state
  }

  /** Abort handle for the current invoke stream, if any */
  private _invokeAbort: (() => void) | null = null;

  /**
   * Get status of a running swarm execution
   */
  async getSwarmStatus(taskId: string): Promise<SwarmStatusResponse> {
    if (API_BASE_URL == null) {
      throw new Error('API server URL not configured');
    }

    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/marketing-swarm/status/${taskId}`, {
        method: 'GET',
      });

      if (!response.ok) {
        if (response.status === 401) {
          await triggerReLogin();
        }
        throw new Error(`Failed to get swarm status: HTTP ${response.status}`);
      }

      // Validate JSON response
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('API server returned non-JSON response');
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`API server not reachable at ${API_BASE_URL}`);
      }
      console.error('Failed to get swarm status:', error);
      throw error;
    }
  }

  /**
   * Get task info by conversation ID
   * Used to restore task state when navigating to an existing conversation
   */
  async getTaskByConversationId(conversationId: string): Promise<{ taskId: string; status: string } | null> {
    // If LangGraph not configured, return null (caller will use API tasks instead)
    if (API_BASE_URL == null) {
      return null;
    }

    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/marketing-swarm/by-conversation/${conversationId}`, {
        method: 'GET',
      });

      if (!response.ok) {
        if (response.status === 404) {
          // No task found for this conversation - that's okay, it's a new conversation
          return null;
        }
        if (response.status === 401) {
          await triggerReLogin();
        }
        throw new Error('Failed to get task by conversation');
      }

      // Validate JSON response before parsing
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.warn('API server returned non-JSON response for task lookup');
        return null;
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('Failed to get task by conversation:', error);
      return null;
    }
  }

  /**
   * Get full state of a swarm execution (for reconnection)
   */
  async getSwarmState(taskId: string): Promise<SwarmStateResponse> {
    const store = useMarketingSwarmStore();

    // Check if LangGraph URL is configured
    if (API_BASE_URL == null) {
      throw new Error('API server URL not configured');
    }

    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/marketing-swarm/state/${taskId}`, {
        method: 'GET',
      });

      if (!response.ok) {
        if (response.status === 401) {
          await triggerReLogin();
        }
        throw new Error(`Failed to get swarm state: HTTP ${response.status}`);
      }

      // Check content-type before parsing JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        const preview = text.substring(0, 100);
        throw new Error(
          `API server returned non-JSON response (${contentType || 'no content-type'}): ${preview}...`
        );
      }

      const result = await response.json();

      if (!result.data) {
        throw new Error('API server returned response without data field');
      }

      const rawState = result.data;

      // Transform snake_case API response to camelCase and populate phase2 structures
      const outputs = (rawState.outputs || []).map((o: RawApiOutput) => ({
        id: o.id,
        status: o.status || 'pending',
        writerAgent: {
          slug: o.writer_agent_slug,
          name: o.writer_agent_slug,
          llmProvider: o.writer_llm_provider,
          llmModel: o.writer_llm_model,
        },
        editorAgent: o.editor_agent_slug ? {
          slug: o.editor_agent_slug,
          name: o.editor_agent_slug,
          llmProvider: o.editor_llm_provider,
          llmModel: o.editor_llm_model,
        } : null,
        content: o.content,
        editCycle: o.edit_cycle || 0,
        editorFeedback: o.editor_feedback,
        initialAvgScore: o.initial_avg_score != null ? Number(o.initial_avg_score) : null,
        initialRank: o.initial_rank != null ? Number(o.initial_rank) : null,
        isFinalist: o.is_finalist,
        finalTotalScore: o.final_total_score != null ? Number(o.final_total_score) : null,
        finalRank: o.final_rank != null ? Number(o.final_rank) : null,
        llmMetadata: o.llm_metadata ? {
          tokensUsed: o.llm_metadata.tokensUsed,
          cost: o.llm_metadata.cost,
          totalLatencyMs: o.llm_metadata.totalLatencyMs,
          llmCallCount: o.llm_metadata.llmCallCount,
          lastLatencyMs: o.llm_metadata.lastLatencyMs,
        } : undefined,
      }));

      const evaluations = (rawState.evaluations || []).map((e: RawApiEvaluation) => ({
        id: e.id,
        outputId: e.output_id,
        evaluatorAgent: {
          slug: e.evaluator_agent_slug,
          name: e.evaluator_agent_slug,
          llmProvider: e.evaluator_llm_provider,
          llmModel: e.evaluator_llm_model,
        },
        stage: e.stage,
        status: e.status,
        score: e.score != null ? Number(e.score) : null,
        reasoning: e.reasoning,
        rank: e.rank != null ? Number(e.rank) : null,
        weightedScore: e.weighted_score != null ? Number(e.weighted_score) : null,
        llmMetadata: e.llm_metadata ? {
          tokensUsed: e.llm_metadata.tokensUsed,
          cost: e.llm_metadata.cost,
          latencyMs: e.llm_metadata.latencyMs,
        } : undefined,
      }));

      // Populate phase2 structures in store
      for (const output of outputs) {
        store.upsertPhase2Output(output);
      }
      for (const evaluation of evaluations) {
        store.upsertPhase2Evaluation(evaluation);
      }

      // Build rankings from outputs
      const initialRankings = outputs
        .filter((o: { initialRank: number | undefined }) => o.initialRank != null)
        .sort((a: { initialRank: number }, b: { initialRank: number }) => a.initialRank - b.initialRank)
        .map((o: { id: string; writerAgent: { slug: string }; editorAgent: { slug: string } | null; initialAvgScore: number; initialRank: number }) => ({
          outputId: o.id,
          writerAgentSlug: o.writerAgent.slug,
          editorAgentSlug: o.editorAgent?.slug,
          avgScore: o.initialAvgScore,
          rank: o.initialRank,
        }));

      const finalRankings = outputs
        .filter((o: { finalRank: number | undefined }) => o.finalRank != null)
        .sort((a: { finalRank: number }, b: { finalRank: number }) => a.finalRank - b.finalRank)
        .map((o: { id: string; writerAgent: { slug: string }; editorAgent: { slug: string } | null; finalTotalScore: number; finalRank: number }) => ({
          outputId: o.id,
          writerAgentSlug: o.writerAgent.slug,
          editorAgentSlug: o.editorAgent?.slug,
          totalScore: o.finalTotalScore,
          rank: o.finalRank,
        }));

      const finalists = outputs
        .filter((o: { isFinalist: boolean | undefined }) => o.isFinalist)
        .map((o: { id: string; writerAgent: { slug: string }; initialRank: number }) => ({
          outputId: o.id,
          writerAgentSlug: o.writerAgent.slug,
          initialRank: o.initialRank,
        }));

      store.setInitialRankings(initialRankings);
      store.setFinalRankings(finalRankings);
      store.setFinalists(finalists);

      // Determine phase based on output status
      const hasCompletedOutputs = outputs.some((o: { finalRank: number | undefined }) => o.finalRank != null);
      const phase = hasCompletedOutputs ? 'completed' : 'writing';
      store.setPhase(phase);

      // Return a compatible response object
      return {
        taskId,
        phase,
        outputs,
        evaluations,
        executionQueue: [],
      } as unknown as SwarmStateResponse;
    } catch (error) {
      // Provide more context for network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        console.error(`Failed to connect to API server at ${API_BASE_URL}. Is it running?`);
        throw new Error(`API server not reachable at ${API_BASE_URL}`);
      }
      console.error('Failed to get swarm state:', error);
      throw error;
    }
  }

  /**
   * Poll for status updates while execution is running
   */
  async pollStatus(
    taskId: string,
    onUpdate: (status: SwarmStatusResponse) => void,
    intervalMs: number = 2000
  ): Promise<void> {
    const store = useMarketingSwarmStore();

    const poll = async () => {
      try {
        const status = await this.getSwarmStatus(taskId);
        onUpdate(status);

        // Continue polling if not completed or failed
        if (status.phase !== 'completed' && status.phase !== 'failed') {
          setTimeout(poll, intervalMs);
        } else {
          store.setExecuting(false);
          if (status.phase === 'completed') {
            // Fetch full state to get outputs and evaluations
            await this.getSwarmState(taskId);
            store.setUIView('results');
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
        store.setExecuting(false);
      }
    };

    poll();
  }

  /**
   * Get past swarm tasks for a user
   */
  async getUserSwarmTasks(
    orgSlug: string,
    userId: string,
    limit: number = 20
  ): Promise<{ taskId: string; status: string; contentTypeSlug: string; createdAt: string }[]> {
    try {
      const response = await apiService.get<
        { taskId: string; status: string; contentTypeSlug: string; createdAt: string }[]
      >(`/marketing/swarm-tasks?organizationSlug=${orgSlug}&userId=${userId}&limit=${limit}`);
      return response;
    } catch (error) {
      console.error('Failed to fetch user swarm tasks:', error);
      return [];
    }
  }

  // ============================================================================
  // Phase 2: SSE Streaming for Real-Time Updates
  // ============================================================================

  /**
   * Connect to the observability SSE stream and filter for marketing swarm events.
   * Uses conversationId to filter events for the current task.
   */
  connectToSSEStream(conversationId: string): void {
    const store = useMarketingSwarmStore();

    // Disconnect existing connection if any
    this.disconnectSSEStream();

    // Get auth token for SSE connection
    const token = getAuthToken();
    if (!token) {
      console.error('[MarketingSwarm] No auth token available for SSE connection');
      store.setError('Authentication required for real-time updates');
      return;
    }

    // Create new SSE client
    this.sseClient = new SSEClient({
      maxReconnectAttempts: 10,
      reconnectDelay: 2000,
      debug: true,
    });

    // Build SSE URL with conversationId filter and token
    // EventSource doesn't support custom headers, so auth must be via query param
    const sseUrl = `${API_BASE_URL}/observability/stream?conversationId=${conversationId}&token=${encodeURIComponent(token)}`;

    // Use console.log for connection status so it's always visible (not filtered)
    console.log('[MarketingSwarm] 🔌 Connecting to SSE stream:', sseUrl.replace(token, '***'));
    console.log('[MarketingSwarm] 🔌 Filtering by conversationId:', conversationId);

    // Listen for state changes
    const stateCleanup = this.sseClient.onStateChange((sseState) => {
      console.log('[MarketingSwarm] 🔌 SSE state changed:', sseState);
      store.setSSEConnected(sseState === 'connected');

      // Log errors prominently
      if (sseState === 'error') {
        console.error('[MarketingSwarm] ❌ SSE connection error - check authentication and network');
      }
    });
    this.sseCleanup.push(stateCleanup);

    // Listen for errors
    // Don't immediately set store error - SSE errors might be transient
    // Only show SSE error if the API call succeeds but we can't get updates
    const errorCleanup = this.sseClient.onError((error) => {
      console.error('[MarketingSwarm] SSE connection error:', error);
      // Don't set store error immediately - let the API call error take precedence
      // If the API call succeeds but SSE fails, observability events will handle status updates
      // This prevents SSE connection issues from masking actual LLM/API errors
    });
    this.sseCleanup.push(errorCleanup);

    // Listen for data events (observability events come as 'message' events)
    const messageCleanup = this.sseClient.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data) as ObservabilityEvent;

        // Skip connection confirmation events
        // Note: Server sends { event_type: 'connected' } not hook_event_type
        if (data.hook_event_type === 'connected' || (data as unknown as Record<string, unknown>).event_type === 'connected') {
          console.log('[MarketingSwarm] ✅ SSE connection confirmed by server');
          return;
        }

        // Log all received events with full payload structure
        console.log('[MarketingSwarm] 📨 SSE event received:', {
          hook_event_type: data.hook_event_type,
          context: data.context,
          payloadKeys: Object.keys((data as unknown as { payload?: Record<string, unknown> }).payload || {}),
          payloadDataKeys: Object.keys(((data as unknown as { payload?: Record<string, unknown> }).payload?.data as Record<string, unknown>) || {}),
          fullPayload: (data as unknown as { payload?: Record<string, unknown> }).payload,
        });

        this.handleObservabilityEvent(data);
      } catch (err) {
        console.error('[MarketingSwarm] Failed to parse SSE event:', err, event.data);
      }
    });
    this.sseCleanup.push(messageCleanup);

    // Connect to SSE stream
    this.sseClient.connect(sseUrl);
    // Don't set connected immediately - wait for onopen event
  }

  /**
   * Disconnect from the SSE stream
   */
  disconnectSSEStream(): void {
    const store = useMarketingSwarmStore();

    // Clean up event listeners
    this.sseCleanup.forEach((cleanup) => cleanup());
    this.sseCleanup = [];

    // Disconnect SSE client
    if (this.sseClient) {
      this.sseClient.disconnect();
      this.sseClient = null;
    }

    store.setSSEConnected(false);
    console.debug('[MarketingSwarm] 🔌 Disconnected from SSE stream');
  }

  /**
   * Handle incoming observability events and update store
   */
  private handleObservabilityEvent(event: ObservabilityEvent): void {
    // Marketing Swarm metadata structure follows transport-types pattern:
    // ObservabilityEventRecord has payload.data where LangGraph puts metadata directly
    // LangGraph emits: observability.emitProgress(ctx, taskId, msg, { metadata: { type, ... } })
    // ObservabilityService spreads metadata into payload.data: { type, phase, ... }
    // So we look for type directly in payload.data (not payload.data.metadata)
    const payload = (event as unknown as { payload?: Record<string, unknown> })?.payload;
    const data = payload?.data as Record<string, unknown> | undefined;

    // Marketing swarm metadata is directly in data (not nested in data.metadata)
    // Fallback to payload.metadata for backward compatibility
    const metadata = (data && 'type' in data ? data : payload?.metadata) as SSEMetadataPhase2 | undefined;

    if (!metadata || !metadata.type) {
      // Not a marketing swarm event or missing type
      // Debug for troubleshooting - use console.log so it's always visible
      console.log('[MarketingSwarm] ⏭️ Event skipped - no metadata.type:', {
        hook_event_type: event.hook_event_type,
        hasPayload: !!payload,
        hasData: !!data,
        dataKeys: data ? Object.keys(data) : [],
        dataTypeField: data ? (data as Record<string, unknown>).type : undefined,
        payloadKeys: payload ? Object.keys(payload) : [],
        payloadMetadataKeys: payload?.metadata ? Object.keys(payload.metadata as object) : [],
      });
      return;
    }

    console.log('[MarketingSwarm] ✅ Processing SSE event:', metadata.type, JSON.stringify(metadata).substring(0, 500));

    switch (metadata.type) {
      case 'phase_changed':
        this.handlePhaseChanged(metadata as PhaseChangedMetadata);
        break;

      case 'queue_built':
        this.handleQueueBuilt(metadata as QueueBuiltMetadata);
        break;

      case 'output_updated':
        this.handleOutputUpdated(metadata as OutputUpdatedMetadata);
        break;

      case 'evaluation_updated':
        this.handleEvaluationUpdated(metadata as EvaluationUpdatedMetadata);
        break;

      case 'finalists_selected':
        this.handleFinalistsSelected(metadata as FinalistsSelectedMetadata);
        break;

      case 'ranking_updated':
        this.handleRankingUpdated(metadata as RankingUpdatedMetadata);
        break;

      default:
        console.log('[MarketingSwarm] Unknown event type:', (metadata as Record<string, unknown>).type);
    }
  }

  private handlePhaseChanged(metadata: PhaseChangedMetadata): void {
    const store = useMarketingSwarmStore();
    console.log('[MarketingSwarm] Phase changed to:', metadata.phase);
    store.setPhase(metadata.phase);

    // Auto-switch to results view when completed
    if (metadata.phase === 'completed') {
      store.setExecuting(false);

      // Re-fetch full state from API before switching to results view
      // SSE events may not have all the final ranking data
      const taskId = store.currentTaskId || store.currentTask?.taskId;
      if (taskId) {
        this.getSwarmState(taskId)
          .then(() => {
            console.log('[MarketingSwarm] State re-fetched on completion, switching to results');
            store.setUIView('results');
          })
          .catch((err) => {
            console.error('[MarketingSwarm] Failed to re-fetch state on completion:', err);
            // Switch to results anyway with whatever data we have from SSE
            store.setUIView('results');
          });
      } else {
        store.setUIView('results');
      }

      // Add completion message to conversation
      try {
        const executionContextStore = useExecutionContextStore();
        if (executionContextStore.isInitialized) {
          const ctx = executionContextStore.current;
          const conversationsStore = useConversationsStore();
          const outputCount = store.phase2Outputs?.length || 0;
          const evalCount = store.phase2Evaluations?.length || 0;

          conversationsStore.addMessage(ctx.conversationId, {
            conversationId: ctx.conversationId,
            role: 'assistant',
            content: `Marketing Swarm execution completed! Generated ${outputCount} output${outputCount !== 1 ? 's' : ''} with ${evalCount} evaluation${evalCount !== 1 ? 's' : ''}.`,
            timestamp: new Date().toISOString(),
            metadata: {
              marketingSwarmCompleted: true,
              taskId: executionContextStore.taskId ?? undefined,
              outputCount,
              evaluationCount: evalCount,
            },
          });

          console.log('[MarketingSwarm] Added completion message to conversation via SSE:', ctx.conversationId);
        }
      } catch (err) {
        console.error('[MarketingSwarm] Failed to add completion message:', err);
      }
    } else if (metadata.phase === 'failed') {
      store.setExecuting(false);
    }
  }

  private handleQueueBuilt(metadata: QueueBuiltMetadata): void {
    const store = useMarketingSwarmStore();
    console.log('[MarketingSwarm] 🏗️ Queue built:', metadata.totalOutputs, 'outputs, outputsArray:', JSON.stringify(metadata.outputs));
    store.setTotalOutputsCount(metadata.totalOutputs);

    // Initialize phase 2 outputs from queue
    metadata.outputs.forEach((output) => {
      console.log('[MarketingSwarm] 🏗️ Upserting phase2 output:', output.id, output.status, output.writerAgentSlug);
      store.upsertPhase2Output({
        id: output.id,
        status: output.status as 'pending_write',
        writerAgent: { slug: output.writerAgentSlug },
        editorAgent: output.editorAgentSlug ? { slug: output.editorAgentSlug } : null,
        editCycle: 0,
      });
    });
    console.log('[MarketingSwarm] 🏗️ After upsert, phase2Outputs count:', store.phase2Outputs.length);
  }

  private handleOutputUpdated(metadata: OutputUpdatedMetadata): void {
    const store = useMarketingSwarmStore();
    console.log('[MarketingSwarm] 📝 Output updated:', metadata.output.id, metadata.output.status, 'writerAgent:', JSON.stringify(metadata.output.writerAgent));
    store.upsertPhase2Output(metadata.output);
    console.log('[MarketingSwarm] 📝 After upsert, phase2Outputs count:', store.phase2Outputs.length);
  }

  private handleEvaluationUpdated(metadata: EvaluationUpdatedMetadata): void {
    const store = useMarketingSwarmStore();
    console.log('[MarketingSwarm] Evaluation updated:', metadata.evaluation.id, metadata.evaluation.status);
    store.upsertPhase2Evaluation(metadata.evaluation);
  }

  private handleFinalistsSelected(metadata: FinalistsSelectedMetadata): void {
    const store = useMarketingSwarmStore();
    console.log('[MarketingSwarm] Finalists selected:', metadata.count);
    store.setFinalists(metadata.finalists);
  }

  private handleRankingUpdated(metadata: RankingUpdatedMetadata): void {
    const store = useMarketingSwarmStore();
    console.log('[MarketingSwarm] Rankings updated:', metadata.stage);

    if (metadata.stage === 'initial') {
      store.setInitialRankings(metadata.rankings);
    } else {
      store.setFinalRankings(metadata.rankings);
    }
  }

  // ============================================================================
  // Output Version History
  // ============================================================================

  /**
   * Get version history for a specific output
   *
   * Returns all versions of an output including:
   * - Initial write content
   * - Any rewrites after editor feedback
   * - Editor feedback that triggered each rewrite
   *
   * Used by modal to show write/edit history.
   */
  async getOutputVersions(outputId: string): Promise<OutputVersionsResponse> {
    if (API_BASE_URL == null) {
      throw new Error('API server URL not configured');
    }

    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/marketing-swarm/output/${outputId}/versions`, {
        method: 'GET',
      });

      if (!response.ok) {
        if (response.status === 401) {
          await triggerReLogin();
        }
        throw new Error(`Failed to get output versions: HTTP ${response.status}`);
      }

      // Validate JSON response
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('API server returned non-JSON response');
      }

      const result = await response.json();
      return result.data as OutputVersionsResponse;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`API server not reachable at ${API_BASE_URL}`);
      }
      console.error('Failed to get output versions:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const marketingSwarmService = new MarketingSwarmService();
