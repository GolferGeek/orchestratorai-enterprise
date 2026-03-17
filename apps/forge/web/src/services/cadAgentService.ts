/**
 * CAD Agent Service - Async Operations Only
 *
 * Architecture: Services handle ALL async operations:
 * - A2A protocol calls (generateCad)
 * - API calls (getStatus, getOutputs, fetchProjects)
 * - SSE streaming (connectToSSEStream)
 * - File downloads (downloadFile)
 *
 * ExecutionContext: This service does NOT create ExecutionContext.
 * ExecutionContext is received from executionContextStore and passed through.
 *
 * Three-Layer Architecture:
 * - Service Layer (THIS FILE): All async operations, API calls
 * - Store Layer: State + synchronous mutations only
 * - Component Layer: UI presentation only
 */

import { apiService } from './apiService';
import { useCadAgentStore } from '@/stores/cadAgentStore';
import type {
  CadConstraints,
  CadOutputs,
  MeshStats,
  ExecutionLogEntry,
  Project,
} from '@/stores/cadAgentStore';
import { a2aOrchestrator } from './agent2agent/orchestrator/a2a-orchestrator';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import { SSEClient } from './agent2agent/sse/sseClient';
import { tasksService } from './tasksService';
import { getSecureApiBaseUrl } from '@/utils/securityConfig';

/**
 * Get auth token from storage
 * TokenStorageService migrates tokens from localStorage to sessionStorage,
 * so we check sessionStorage first, then fall back to localStorage
 */
function getAuthToken(): string | null {
  return sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
}

// ============================================================================
// API CONFIGURATION
// ============================================================================

// API base URL - uses getSecureApiBaseUrl() for correct URL in all environments
// LangGraph workflows are now served by the unified API
const API_BASE_URL = getSecureApiBaseUrl();


// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Parameters for generating CAD
 */
export interface GenerateCadParams {
  prompt: string;
  projectId?: string;
  newProjectName?: string; // If creating a new project
  constraints: CadConstraints;
  outputFormats: string[]; // e.g., ['step', 'stl', 'gltf', 'dxf']
}

/**
 * Response from CAD generation
 */
export interface CadGenerationResponse {
  taskId: string;
  status: 'running' | 'completed' | 'failed';
  drawingId?: string;
  outputs?: CadOutputs;
  meshStats?: MeshStats;
}

/**
 * Status response from LangGraph
 */
export interface CadStatusResponse {
  taskId: string;
  status: 'running' | 'completed' | 'failed';
  stage: string | null;
  progressPercent: number;
  drawingId?: string;
  error?: string;
}

/**
 * SSE event metadata for CAD generation
 */
interface CadSSEMetadata {
  type: 'progress' | 'log' | 'code' | 'validation' | 'outputs' | 'completed' | 'failed';
  stage?: string;
  progressPercent?: number;
  message?: string;
  code?: string;
  isValid?: boolean;
  validationErrors?: string[];
  attempt?: number;
  outputs?: CadOutputs;
  meshStats?: MeshStats;
  error?: string;
  logEntry?: ExecutionLogEntry;
}

/**
 * Observability event structure (same as marketing swarm)
 */
interface ObservabilityEvent {
  hook_event_type: string;
  event_type: string;
  context: {
    conversationId: string;
    taskId: string;
  };
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class CadAgentService {
  private sseClient: SSEClient | null = null;
  private sseCleanup: (() => void)[] = [];

  // ==========================================================================
  // A2A PROTOCOL CALLS
  // ==========================================================================

  /**
   * Start CAD generation via A2A protocol
   *
   * This uses the same flow as Marketing Swarm:
   * 1. ExecutionContext must be initialized (from conversation selection)
   * 2. Uses a2aOrchestrator.execute() which POSTs to /invoke
   * 3. Backend creates task record, then hands to API runner which calls LangGraph
   *
   * @param params - CAD generation parameters
   * @returns Generation response with taskId
   */
  async generateCad(params: GenerateCadParams): Promise<CadGenerationResponse> {
    const store = useCadAgentStore();
    store.setGenerating(true);
    store.clearError();
    store.setUIView('progress');
    store.resetTaskState();

    try {
      // Verify ExecutionContext is initialized
      const executionContextStore = useExecutionContextStore();
      if (!executionContextStore.isInitialized) {
        throw new Error('ExecutionContext not initialized. Select a conversation first.');
      }

      // Generate a new taskId for this execution
      const taskId = executionContextStore.newTaskId();
      const ctx = executionContextStore.current;

      console.log('[CAD Agent] Starting generation via A2A framework', {
        conversationId: ctx.conversationId,
        taskId,
        agentSlug: ctx.agentSlug,
      });

      // Execute through A2A orchestrator
      // The A2A orchestrator will:
      // 1. POST to /invoke
      // 2. Backend creates task record with conversationId/taskId
      // 3. Backend routes to API runner which calls LangGraph
      // 4. LLM usage is properly tracked with valid conversationId
      const result = await a2aOrchestrator.execute('build.create', {
        userMessage: JSON.stringify({
          type: 'cad-generation-request',
          prompt: params.prompt,
          projectId: params.projectId,
          newProjectName: params.newProjectName,
          constraints: params.constraints,
          outputFormats: params.outputFormats,
        }),
      });

      console.log('[CAD Agent] A2A execution result:', result);

      // Handle A2A result
      if (result.type === 'error') {
        throw new Error(result.error || 'CAD generation failed');
      }

      // Extract CAD response from A2A result
      const taskResponse: CadGenerationResponse = {
        taskId,
        status: 'running',
      };

      // Handle deliverable response (BUILD mode returns deliverable)
      if (result.type === 'deliverable' && result.version?.content) {
        try {
          // The content is a JSON string containing the LangGraph response
          const contentStr = typeof result.version.content === 'string'
            ? result.version.content
            : JSON.stringify(result.version.content);

          const parsed = JSON.parse(contentStr);

          // The LangGraph response structure: { statusCode: 200, data: { success: true/false, data: {...} } }
          const langGraphData = parsed.data?.data || parsed.data || parsed;

          // Check for errors
          if (langGraphData.success === false) {
            const errorMsg = langGraphData.error || langGraphData.message || 'CAD generation failed';
            throw new Error(errorMsg);
          }

          // Extract CAD results
          if (langGraphData.drawingId) taskResponse.drawingId = langGraphData.drawingId;
          if (langGraphData.outputs) taskResponse.outputs = langGraphData.outputs;
          if (langGraphData.meshStats) taskResponse.meshStats = langGraphData.meshStats;

          // Update status based on LangGraph response
          if (langGraphData.status === 'completed') {
            taskResponse.status = 'completed';
          } else if (langGraphData.status === 'failed') {
            throw new Error(langGraphData.error || 'CAD generation failed');
          }
        } catch (parseError) {
          console.error('[CAD Agent] Failed to parse deliverable content:', parseError);
          // If it's already an Error, re-throw it
          if (parseError instanceof Error) {
            throw parseError;
          }
          // Otherwise, try to extract error from content
          throw new Error('Failed to parse CAD generation response');
        }
      }

      // Handle message response (fallback for other response types)
      if (result.type === 'message' && result.message) {
        try {
          const parsed = typeof result.message === 'string'
            ? JSON.parse(result.message)
            : result.message;

          if (parsed.drawingId) taskResponse.drawingId = parsed.drawingId;
          if (parsed.outputs) taskResponse.outputs = parsed.outputs;
          if (parsed.meshStats) taskResponse.meshStats = parsed.meshStats;
          if (parsed.status === 'completed') taskResponse.status = 'completed';
        } catch {
          // Message is not JSON, use as-is
          console.log('[CAD Agent] Response message is not JSON:', result.message);
        }
      }

      // Update store with results
      store.setCurrentTaskId(taskId);
      if (taskResponse.drawingId) {
        store.setCurrentDrawingId(taskResponse.drawingId);
      }
      if (taskResponse.outputs) {
        store.setOutputs(taskResponse.outputs);
      }
      if (taskResponse.meshStats) {
        store.setMeshStats(taskResponse.meshStats);
      }

      // Switch to deliverables view if completed (only if already completed synchronously)
      // Otherwise, SSE events will handle status updates
      if (taskResponse.status === 'completed') {
        store.setUIView('deliverables');
        store.setGenerating(false);
      } else {
        // Execution is running asynchronously - keep generating state true
        // SSE events will update status and set generating to false when done
        console.log('[CAD Agent] Execution started, waiting for SSE updates...');
      }

      return taskResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'CAD generation failed';
      
      // Disconnect SSE stream on error - no point keeping it connected if API call failed
      this.disconnectSSEStream();
      
      store.setError(message);
      store.setGenerating(false);
      throw error;
    }
    // Note: Don't set generating(false) in finally block - let SSE events control generation state
  }

  // ==========================================================================
  // STATUS POLLING
  // ==========================================================================

  /**
   * Get generation status from LangGraph
   *
   * @param taskId - Task ID to check status
   * @returns Status response
   */
  async getStatus(taskId: string): Promise<CadStatusResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/agents/engineering/cad-agent/status/${taskId}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get CAD generation status');
      }

      const result = await response.json();
      const data = result.data as CadStatusResponse;

      // Update store with status
      const store = useCadAgentStore();
      if (data.stage) {
        store.setCurrentStage(data.stage);
      }
      if (data.progressPercent !== undefined) {
        store.setProgressPercent(data.progressPercent);
      }
      if (data.drawingId) {
        store.setCurrentDrawingId(data.drawingId);
      }

      return data;
    } catch (error) {
      console.error('Failed to get CAD generation status:', error);
      throw error;
    }
  }

  // ==========================================================================
  // OUTPUT FILES
  // ==========================================================================

  /**
   * Get output files for a drawing
   *
   * @param drawingId - Drawing ID to get outputs
   * @returns Outputs and mesh stats
   */
  async getOutputs(drawingId: string): Promise<{ outputs: CadOutputs; meshStats: MeshStats }> {
    try {
      const response = await fetch(`${API_BASE_URL}/agents/engineering/cad-agent/outputs/${drawingId}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get CAD outputs');
      }

      const result = await response.json();
      const data = result.data;

      // Update store with outputs
      const store = useCadAgentStore();
      if (data.outputs) {
        store.setOutputs(data.outputs);
      }
      if (data.meshStats) {
        store.setMeshStats(data.meshStats);
      }

      return {
        outputs: data.outputs || {},
        meshStats: data.meshStats || null,
      };
    } catch (error) {
      console.error('Failed to get CAD outputs:', error);
      throw error;
    }
  }

  // ==========================================================================
  // SSE STREAMING
  // ==========================================================================

  /**
   * Connect to the observability SSE stream and filter for CAD agent events.
   * Uses conversationId to filter events for the current task.
   *
   * This follows the same pattern as Marketing Swarm:
   * - Connects to /observability/stream with conversationId filter
   * - Handles real-time progress events
   * - Updates store with progress, logs, code, validation, outputs
   */
  connectToSSEStream(conversationId: string): void {
    const store = useCadAgentStore();

    // Disconnect existing connection if any
    this.disconnectSSEStream();

    // Get auth token for SSE connection
    const token = getAuthToken();
    if (!token) {
      console.error('[CAD Agent] No auth token available for SSE connection');
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
    console.log('[CAD Agent] 🔌 Connecting to SSE stream:', sseUrl.replace(token, '***'));
    console.log('[CAD Agent] 🔌 Filtering by conversationId:', conversationId);

    // Listen for state changes
    const stateCleanup = this.sseClient.onStateChange((sseState) => {
      console.log('[CAD Agent] 🔌 SSE state changed:', sseState);

      // Log errors prominently
      if (sseState === 'error') {
        console.error('[CAD Agent] ❌ SSE connection error - check authentication and network');
      }
    });
    this.sseCleanup.push(stateCleanup);

    // Listen for errors
    // Don't immediately set store error - SSE errors might be transient
    // Only show SSE error if the API call succeeds but we can't get updates
    const errorCleanup = this.sseClient.onError((error) => {
      console.error('[CAD Agent] SSE connection error:', error);
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
        if (data.event_type === 'connected') {
          console.log('[CAD Agent] ✅ SSE connection confirmed by server');
          return;
        }

        // Log all received events with full payload structure
        console.log('[CAD Agent] 📨 SSE event received:', {
          hook_event_type: data.hook_event_type,
          event_type: data.event_type,
          context: data.context,
          payloadKeys: Object.keys((data as unknown as { payload?: Record<string, unknown> }).payload || {}),
          payloadDataKeys: Object.keys(((data as unknown as { payload?: Record<string, unknown> }).payload?.data as Record<string, unknown>) || {}),
          fullPayload: (data as unknown as { payload?: Record<string, unknown> }).payload,
        });

        this.handleObservabilityEvent(data);
      } catch (err) {
        console.error('[CAD Agent] Failed to parse SSE event:', err, event.data);
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
    // Clean up event listeners
    this.sseCleanup.forEach((cleanup) => cleanup());
    this.sseCleanup = [];

    // Disconnect SSE client
    if (this.sseClient) {
      this.sseClient.disconnect();
      this.sseClient = null;
    }

    console.debug('[CAD Agent] 🔌 Disconnected from SSE stream');
  }

  /**
   * Handle incoming observability events and update store
   */
  private handleObservabilityEvent(event: ObservabilityEvent): void {
    // CAD agent metadata structure follows transport-types pattern:
    // ObservabilityEventRecord has payload.data where LangGraph puts metadata directly
    // LangGraph emits: observability.emitProgress(ctx, taskId, msg, { metadata: { type, ... } })
    // ObservabilityService spreads metadata into payload.data: { type, stage, ... }
    // So we look for type directly in payload.data (not payload.data.metadata)
    const payload = (event as unknown as { payload?: Record<string, unknown> })?.payload;
    const data = payload?.data as Record<string, unknown> | undefined;

    // CAD agent metadata is directly in data (not nested in data.metadata)
    // Fallback to payload.metadata for backward compatibility
    const metadata = (data && 'type' in data ? data : payload?.metadata) as CadSSEMetadata | undefined;

    if (!metadata || !metadata.type) {
      // Not a CAD agent event or missing type
      // Debug for troubleshooting
      console.debug('[CAD Agent] ⏭️ Event skipped - no metadata.type:', {
        hook_event_type: event.hook_event_type,
        hasPayload: !!payload,
        hasData: !!data,
        dataKeys: data ? Object.keys(data) : [],
        payloadKeys: payload ? Object.keys(payload) : [],
      });
      return;
    }

    console.debug('[CAD Agent] ✅ Processing SSE event:', metadata.type, metadata);

    switch (metadata.type) {
      case 'progress':
        this.handleProgress(metadata);
        break;

      case 'log':
        this.handleLog(metadata);
        break;

      case 'code':
        this.handleCode(metadata);
        break;

      case 'validation':
        this.handleValidation(metadata);
        break;

      case 'outputs':
        this.handleOutputs(metadata);
        break;

      case 'completed':
        this.handleCompleted(metadata);
        break;

      case 'failed':
        this.handleFailed(metadata);
        break;

      default:
        console.log('[CAD Agent] Unknown event type:', metadata.type);
    }
  }

  private handleProgress(metadata: CadSSEMetadata): void {
    const store = useCadAgentStore();
    console.log('[CAD Agent] Progress update:', metadata.stage, metadata.progressPercent);

    if (metadata.stage) {
      store.setCurrentStage(metadata.stage);
    }
    if (metadata.progressPercent !== undefined) {
      store.setProgressPercent(metadata.progressPercent);
    }
  }

  private handleLog(metadata: CadSSEMetadata): void {
    const store = useCadAgentStore();
    console.log('[CAD Agent] Log entry:', metadata.logEntry);

    if (metadata.logEntry) {
      store.addExecutionLogEntry(metadata.logEntry);
    }
  }

  private handleCode(metadata: CadSSEMetadata): void {
    const store = useCadAgentStore();
    console.log('[CAD Agent] Code generated:', metadata.code?.substring(0, 100));

    if (metadata.code) {
      store.setGeneratedCode(metadata.code);
    }
    if (metadata.attempt !== undefined) {
      // Reset to attempt number (not increment)
      store.resetCodeAttempt();
      for (let i = 0; i < metadata.attempt; i++) {
        store.incrementCodeAttempt();
      }
    }
  }

  private handleValidation(metadata: CadSSEMetadata): void {
    const store = useCadAgentStore();
    console.log('[CAD Agent] Code validation:', metadata.isValid, metadata.validationErrors);

    if (metadata.isValid !== undefined) {
      store.setCodeValidation(metadata.isValid, metadata.validationErrors || []);
    }
  }

  private handleOutputs(metadata: CadSSEMetadata): void {
    const store = useCadAgentStore();
    console.log('[CAD Agent] Outputs updated:', metadata.outputs);

    if (metadata.outputs) {
      store.setOutputs(metadata.outputs);
    }
    if (metadata.meshStats) {
      store.setMeshStats(metadata.meshStats);
    }
  }

  private handleCompleted(metadata: CadSSEMetadata): void {
    const store = useCadAgentStore();
    console.log('[CAD Agent] Generation completed');

    store.setGenerating(false);
    store.setUIView('deliverables');

    // Final outputs and mesh stats
    if (metadata.outputs) {
      store.setOutputs(metadata.outputs);
    }
    if (metadata.meshStats) {
      store.setMeshStats(metadata.meshStats);
    }
  }

  private handleFailed(metadata: CadSSEMetadata): void {
    const store = useCadAgentStore();
    console.log('[CAD Agent] Generation failed:', metadata.error);

    store.setGenerating(false);
    if (metadata.error) {
      store.setError(metadata.error);
    }
  }

  // ==========================================================================
  // PROJECT MANAGEMENT
  // ==========================================================================

  /**
   * Fetch projects for organization
   *
   * @param orgSlug - Organization slug
   * @returns List of projects
   */
  async fetchProjects(orgSlug: string): Promise<Project[]> {
    const store = useCadAgentStore();
    store.setLoading(true);
    store.clearError();

    try {
      const response = await apiService.get<Project[]>(
        `/api/engineering/projects?org=${orgSlug}`
      );

      // Update store with projects
      store.setProjects(response);

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch projects';
      store.setError(message);
      throw error;
    } finally {
      store.setLoading(false);
    }
  }

  /**
   * Create new project
   *
   * @param params - Project creation parameters
   * @returns Created project
   */
  async createProject(params: {
    orgSlug: string;
    name: string;
    description?: string;
    constraints: CadConstraints;
  }): Promise<Project> {
    const store = useCadAgentStore();
    store.setLoading(true);
    store.clearError();

    try {
      const response = await apiService.post<Project>('/api/engineering/projects', {
        organizationSlug: params.orgSlug,
        name: params.name,
        description: params.description,
        constraints: params.constraints,
      });

      // Add project to store
      store.addProject(response);

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create project';
      store.setError(message);
      throw error;
    } finally {
      store.setLoading(false);
    }
  }

  // ==========================================================================
  // CONVERSATION STATE RESTORATION
  // ==========================================================================

  /**
   * Load existing task state for a conversation.
   * Used when switching to an existing conversation to restore the UI state.
   *
   * The task response is deeply nested:
   * response.payload.content.deliverable.currentVersion.content (JSON string)
   * which contains: { data: { data: { outputs, meshStats, generatedCode, status } } }
   *
   * Flow:
   * 1. Query tasks API by conversationId
   * 2. For each task, extract CAD data from the deeply nested response
   * 3. Restore store state (outputs, code, meshStats)
   * 4. Set appropriate view (deliverables/progress/config)
   */
  async loadConversationState(conversationId: string): Promise<void> {
    const store = useCadAgentStore();
    console.warn('[CAD Agent DEBUG] loadConversationState called with:', conversationId);
    store.resetTaskState();

    try {
      // Step 1: Query tasks for this conversation
      const tasksResponse = await tasksService.listTasks({
        conversationId,
        limit: 10,
      });

      console.warn('[CAD Agent DEBUG] Tasks for conversation:', tasksResponse.tasks.length);
      console.warn('[CAD Agent DEBUG] All tasks:', tasksResponse.tasks.map(t => ({
        id: t.id,
        method: t.method,
        status: t.status,
      })));

      if (tasksResponse.tasks.length === 0) {
        console.warn('[CAD Agent DEBUG] No tasks found, showing config');
        store.setUIView('config');
        return;
      }

      // Step 2: Filter to build tasks only — dashboard tasks have no LangGraph state
      // CAD generation uses method 'build.create', dashboard tasks use 'dashboard.*'
      const buildTasks = tasksResponse.tasks.filter(t => t.method.startsWith('build'));
      console.warn('[CAD Agent DEBUG] Build tasks:', buildTasks.length, 'of', tasksResponse.tasks.length, 'total');

      if (buildTasks.length === 0) {
        console.warn('[CAD Agent DEBUG] No build tasks, showing config');
        store.setUIView('config');
        return;
      }

      for (const task of buildTasks) {
        console.warn('[CAD Agent DEBUG] Checking task:', task.id, 'method:', task.method, 'status:', task.status);
        store.setCurrentTaskId(task.id);

        if (task.status === 'completed') {
          // Step 3: Get actual CAD data from LangGraph (task response only has A2A metadata)
          await this.loadCadStateFromLangGraph(task.id);
          return;
        } else if (task.status === 'running') {
          store.setUIView('progress');
          this.connectToSSEStream(conversationId);
          return;
        } else if (task.status === 'failed') {
          store.setError(task.errorMessage || 'Previous generation failed');
          store.setUIView('config');
          return;
        }
      }

      // No usable tasks found
      store.setUIView('config');
    } catch (err) {
      console.error('[CAD Agent] Failed to load conversation state:', err);
      store.setUIView('config');
    }
  }

  /**
   * Load CAD state from LangGraph for a completed task.
   * The task response in the DB only has A2A routing metadata.
   * The actual CAD outputs (files, code, meshStats) live in LangGraph's DB.
   */
  private async loadCadStateFromLangGraph(taskId: string): Promise<void> {
    const store = useCadAgentStore();

    try {
      // Call LangGraph status endpoint — returns outputs directly
      const statusUrl = `${API_BASE_URL}/agents/engineering/cad-agent/status/${taskId}`;
      console.warn('[CAD Agent DEBUG] Fetching LangGraph status:', statusUrl);

      const statusResponse = await fetch(statusUrl, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });

      if (!statusResponse.ok) {
        console.error('[CAD Agent DEBUG] LangGraph status failed:', statusResponse.status);
        store.setUIView('deliverables');
        return;
      }

      const statusResult = await statusResponse.json();
      const statusData = statusResult.data;

      // Handle failed LangGraph status — show error instead of empty deliverables
      if (statusData?.status === 'failed') {
        store.setError(statusData.error || 'Previous CAD generation failed');
        store.setUIView('config');
        return;
      }

      // Set outputs from status response
      if (statusData?.outputs && Object.keys(statusData.outputs).length > 0) {
        store.setOutputs(statusData.outputs);
      }
      if (statusData?.meshStats) {
        store.setMeshStats(statusData.meshStats);
      }
      if (statusData?.drawingId) {
        store.setCurrentDrawingId(statusData.drawingId);
      }
      if (statusData?.generatedCode) {
        store.setGeneratedCode(statusData.generatedCode);
      }

      store.setUIView('deliverables');
    } catch (err) {
      console.error('[CAD Agent] Failed to load from LangGraph:', err);
      store.setUIView('deliverables');
    }
  }

  /**
   * Extract CAD-specific data from the deeply nested A2A task response.
   *
   * Response structure:
   * {
   *   success: true,
   *   payload: {
   *     content: {
   *       deliverable: {
   *         currentVersion: {
   *           content: "<JSON string>" // Contains { data: { data: { outputs, meshStats, ... } } }
   *         }
   *       }
   *     }
   *   }
   * }
   */
  private extractCadDataFromResponse(responseStr: string): {
    outputs?: CadOutputs;
    meshStats?: MeshStats;
    generatedCode?: string;
    status?: string;
  } | null {
    try {
      const response = JSON.parse(responseStr);
      console.log('[CAD Agent] extractCadData - top-level keys:', Object.keys(response));
      console.log('[CAD Agent] extractCadData - success:', response.success);

      // Check if the task succeeded
      if (response.success === false) {
        console.log('[CAD Agent] extractCadData - response.success is false');
        return null;
      }

      // Navigate the nested deliverable structure
      const deliverableContent = response?.payload?.content?.deliverable?.currentVersion?.content;
      console.log('[CAD Agent] extractCadData - deliverableContent exists:', !!deliverableContent, typeof deliverableContent);

      if (deliverableContent) {
        // Content is a JSON string that needs a second parse
        const parsed = typeof deliverableContent === 'string'
          ? JSON.parse(deliverableContent)
          : deliverableContent;

        // Navigate to the CAD data: { data: { data: { outputs, meshStats, ... } } }
        const cadData = parsed?.data?.data || parsed?.data || parsed;

        if (cadData.outputs || cadData.generatedCode || cadData.meshStats) {
          return {
            outputs: cadData.outputs || undefined,
            meshStats: cadData.meshStats || undefined,
            generatedCode: cadData.generatedCode || undefined,
            status: cadData.status || undefined,
          };
        }
      }

      // Fallback: try simpler response structures
      const simpleData = response?.data?.data || response?.data || response;
      if (simpleData.outputs || simpleData.generatedCode) {
        return {
          outputs: simpleData.outputs || undefined,
          meshStats: simpleData.meshStats || undefined,
          generatedCode: simpleData.generatedCode || undefined,
          status: simpleData.status || undefined,
        };
      }

      return null;
    } catch (err) {
      console.log('[CAD Agent] Could not parse task response:', err);
      return null;
    }
  }

  // ==========================================================================
  // FILE DOWNLOADS
  // ==========================================================================

  /**
   * Download CAD file
   *
   * @param url - File URL to download
   * @param filename - Filename for download
   */
  async downloadFile(url: string, filename: string): Promise<void> {
    try {
      // Create temporary link and trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to download file:', error);
      throw error;
    }
  }
}

// ============================================================================
// EXPORT SINGLETON
// ============================================================================

// Export singleton instance
export const cadAgentService = new CadAgentService();
