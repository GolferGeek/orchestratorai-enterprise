import { apiService } from './apiService';
import { useApiSanitization } from '@/composables/useApiSanitization';
import type { JsonObject, JsonValue } from '@orchestrator-ai/transport-types';
import type {
  TaskDetail,
  TaskEvaluation,
  TaskLLMMetadata,
  TaskLLMSelection,
  TaskMetadataRecord,
  TaskParameters,
  TaskResponseMetadata,
  TaskStatus,
} from '@/types/task';
import type { ExecutionMode } from '@/types/conversation';

interface CreateTaskDto {
  method: string;
  prompt: string;
  params?: TaskParameters;
  conversationId?: string;
  taskId?: string; // Optional, pre-generated task ID from frontend
  timeoutSeconds?: number;
  llmSelection?: TaskLLMSelection;
  executionMode?: ExecutionMode; // Execution mode for backend processing
  conversationHistory?: Array<{
    role: string;
    content: string;
    timestamp: string;
    taskId?: string;
    metadata?: JsonObject;
  }>;
  metadata?: TaskMetadataRecord; // Context metadata for deliverable/project operations
}

interface UpdateTaskDto {
  status?: TaskStatus;
  progress?: number;
  progressMessage?: string;
  response?: string;
  responseMetadata?: TaskResponseMetadata;
  evaluation?: TaskEvaluation;
  llmMetadata?: TaskLLMMetadata;
  errorCode?: string;
  errorMessage?: string;
  errorData?: JsonObject;
}

interface TaskQueryParams {
  conversationId?: string;
  userId?: string;
  status?: TaskStatus;
  limit?: number;
  offset?: number;
}

interface ListTasksResponse {
  tasks: TaskDetail[];
  total: number;
}

interface TaskProgressEvent {
  taskId: string;
  progress: number;
  message?: string;
  status?: TaskStatus;
  metadata?: JsonObject;
}

const TASK_STATUS_VALUES: readonly TaskStatus[] = [
  'pending',
  'queued',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
];

const isTaskStatus = (value: unknown): value is TaskStatus =>
  typeof value === 'string' && (TASK_STATUS_VALUES as readonly string[]).includes(value);

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isTaskProgressEvent = (value: unknown): value is TaskProgressEvent => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TaskProgressEvent>;
  return typeof candidate.taskId === 'string' && typeof candidate.progress === 'number';
};
class TasksService {
  private readonly baseUrl = '/tasks';
  private apiSanitization = useApiSanitization();
  /**
   * List tasks
   */
  async listTasks(params?: TaskQueryParams): Promise<ListTasksResponse> {
    const queryParams = new URLSearchParams();
    if (params?.conversationId) queryParams.append('conversationId', params.conversationId);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    const url = queryParams.toString() 
      ? `${this.baseUrl}?${queryParams.toString()}`
      : this.baseUrl;
    const response = await apiService.get<ListTasksResponse>(url);
    return response;
  }
  /**
   * Get task by ID
   */
  async getTask(taskId: string, options?: { suppressErrors?: boolean }): Promise<TaskDetail> {
    const response = await apiService.get<TaskDetail>(`${this.baseUrl}/${taskId}`, options);
    return response;
  }
  /**
   * Update task
   */
  async updateTask(taskId: string, updates: UpdateTaskDto): Promise<TaskDetail> {
    const response = await apiService.put<TaskDetail, UpdateTaskDto>(`${this.baseUrl}/${taskId}`, updates);
    return response;
  }
  /**
   * Cancel task
   */
  async cancelTask(taskId: string): Promise<{ success: boolean; message: string }> {
    const response = await apiService.delete<{ success: boolean; message: string }>(`${this.baseUrl}/${taskId}`);
    return response;
  }
  /**
   * Get active tasks
   */
  async getActiveTasks(): Promise<TaskDetail[]> {
    const response = await apiService.get<TaskDetail[]>(`${this.baseUrl}/active`);
    return response;
  }
  /**
   * Get real-time task status (optimized for polling)
   */
  async getTaskStatus(taskId: string): Promise<{
    taskId: string;
    status: TaskStatus;
    progress: number;
    progressMessage?: string;
    data?: JsonObject | null;
  }> {
    const response = await apiService.get<{
      taskId: string;
      status: TaskStatus;
      progress: number;
      progressMessage?: string;
      data?: JsonObject | null;
    }>(`${this.baseUrl}/${taskId}/status`);
    return response;
  }
  /**
   * Get accumulated task messages (for polling clients)
   */
  async getTaskMessages(taskId: string): Promise<Array<{
    id: string;
    taskId: string;
    content: string;
    messageType: 'progress' | 'status' | 'info' | 'warning' | 'error';
    progressPercentage?: number;
    metadata?: JsonObject;
    createdAt: string;
  }>> {
    const response = await apiService.get<Array<{
      id: string;
      taskId: string;
      content: string;
      messageType: 'progress' | 'status' | 'info' | 'warning' | 'error';
      progressPercentage?: number;
      metadata?: JsonObject;
      createdAt: string;
    }>>(`${this.baseUrl}/${taskId}/messages`);
    return response;
  }
  /**
   * Update task progress
   */
  async updateTaskProgress(taskId: string, progress: number, message?: string): Promise<{ success: boolean }> {
    const response = await apiService.put<{ success: boolean }, { progress: number; message?: string }>(`${this.baseUrl}/${taskId}/progress`, {
      progress,
      message,
    });
    return response;
  }
  /**
   * Stream task progress via SSE
   */
  async *streamTaskProgress(taskId: string): AsyncGenerator<TaskProgressEvent> {
    const streamUrl = `${apiService.getBaseUrl()}${this.baseUrl}/${taskId}/progress`;
    console.log(`[TasksService] 🔌 streamTaskProgress starting for taskId: ${taskId}`);
    console.log(`[TasksService] 🔌 Stream URL: ${streamUrl}`);

    const response = await fetch(streamUrl, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        'Accept': 'text/event-stream',
      },
    });
    console.log(`[TasksService] 🔌 Fetch response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      console.error(`[TasksService] ❌ Failed to stream task progress: ${response.statusText}`);
      throw new Error(`Failed to stream task progress: ${response.statusText}`);
    }
    const reader = response.body?.getReader();
    if (!reader) {
      console.error(`[TasksService] ❌ Response body is not readable`);
      throw new Error('Response body is not readable');
    }
    console.log(`[TasksService] ✅ Reader obtained, starting to read stream`);

    const decoder = new TextDecoder();
    let buffer = '';
    let eventCount = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log(`[TasksService] 📭 Stream ended. Total events received: ${eventCount}`);
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const rawData = line.slice(6);
              console.log(`[TasksService] 📨 Raw SSE data: ${rawData.substring(0, 200)}...`);
              const parsed = JSON.parse(rawData);
              if (!isTaskProgressEvent(parsed)) {
                console.log(`[TasksService] ⚠️ Parsed data is not a valid TaskProgressEvent:`, parsed);
                continue;
              }

              const status = isTaskStatus(parsed.status) ? parsed.status : undefined;
              const metadata = isJsonObject(parsed.metadata) ? parsed.metadata : undefined;
              const message = typeof parsed.message === 'string' ? parsed.message : undefined;

              const event: TaskProgressEvent = {
                taskId: parsed.taskId,
                progress: parsed.progress,
                status,
                metadata,
                message,
              };

              eventCount++;
              console.log(`[TasksService] ✅ Event ${eventCount}: progress=${event.progress}%, status=${event.status}, message=${event.message?.substring(0, 50)}`);
              yield event;

              if (status && (status === 'completed' || status === 'failed' || status === 'cancelled')) {
                console.log(`[TasksService] 🏁 Terminal status reached: ${status}`);
                return;
              }
            } catch (parseError) {
              console.error(`[TasksService] ❌ Error parsing SSE data:`, parseError, `Line: ${line}`);
            }
          }
        }
      }
    } finally {
      console.log(`[TasksService] 🔌 Releasing reader lock`);
      reader.releaseLock();
    }
  }
  /**
   * Create task via direct agent call
   */
  async createAgentTask(
    agentType: string,
    agentName: string,
    taskData: CreateTaskDto,
    options?: { organization?: string | null }
  ): Promise<{
    taskId: string;
    conversationId: string;
    status: TaskStatus;
    result?: JsonValue;
  }> {
    // Validate routing inputs early – never fall back silently
    if (!agentType || !agentName) {
      throw new Error('Cannot create agent task: missing agentType or agentName');
    }

    // Determine routing pattern and payload format based on agent source:
    // - File-based agents (source: undefined): Use DynamicAgentsController - /agents/:agentType/:agentName/tasks
    //   Format: CreateTaskDto { method, prompt, conversationHistory, ... }
    // - Database agents (source: 'database'): Use Agent2AgentController - /agent-to-agent/:organization/:agentName/tasks
    //   Format: JSON-RPC 2.0 { jsonrpc, method, id, params }
    // All agents now use the agent2agent controller with A2A-compliant JSON-RPC 2.0 format
    const organization = options?.organization;
    if (!organization) {
      throw new Error('Cannot create agent task: missing organization');
    }
    
    // Build agent2agent endpoint
    const url = `/agent-to-agent/${organization}/${agentName}/tasks`;
    
    // Transform to JSON-RPC 2.0 format (A2A protocol compliant)
    const paramsInput: TaskParameters = taskData.params ?? {};
    const {
      mode: requestedModeValue,
      payload: rawPayload,
      promptParameters,
      ...extraParams
    } = paramsInput as TaskParameters & {
      mode?: JsonValue;
      payload?: JsonValue;
      promptParameters?: JsonValue;
    };

    const payloadBase = isJsonObject(rawPayload) ? rawPayload : {};
    const mergedPayload: JsonObject = {
      ...payloadBase,
      ...(extraParams as JsonObject),
    };

    if (taskData.llmSelection) {
      // Use config structure for consistency with rerun operations
      mergedPayload.config = {
        provider: taskData.llmSelection.providerName,
        model: taskData.llmSelection.modelName,
        ...(taskData.llmSelection.temperature !== undefined && { temperature: taskData.llmSelection.temperature }),
        ...(taskData.llmSelection.maxTokens !== undefined && { maxTokens: taskData.llmSelection.maxTokens }),
      };
    }
    if (taskData.executionMode) {
      mergedPayload.executionMode = taskData.executionMode;
    }
    if (taskData.taskId) {
      mergedPayload.taskId = taskData.taskId;
    }
    if (typeof taskData.timeoutSeconds === 'number') {
      mergedPayload.timeoutSeconds = taskData.timeoutSeconds;
    }

    const paramsBody: JsonObject = {
      userMessage: taskData.prompt,
      mode: typeof requestedModeValue === 'string' ? requestedModeValue : taskData.method,
      payload: mergedPayload,
    };

    if (taskData.conversationId) {
      paramsBody.conversationId = taskData.conversationId;
    }

    if (taskData.conversationHistory) {
      paramsBody.messages = taskData.conversationHistory.map((msg) => {
        const historyEntry: JsonObject = {
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
        };

        if (msg.taskId) {
          historyEntry.taskId = msg.taskId;
        }

        if (msg.metadata) {
          historyEntry.metadata = msg.metadata;
        }

        return historyEntry;
      });
    }

    if (taskData.metadata) {
      paramsBody.metadata = taskData.metadata;
    }

    if (promptParameters !== undefined) {
      paramsBody.promptParameters = promptParameters;
    }

    const payload: JsonObject = {
      jsonrpc: '2.0',
      method: taskData.method,
      params: paramsBody,
      ...(taskData.taskId ? { id: taskData.taskId } : {}),
    };

    // API returns JSON-RPC 2.0 format: { jsonrpc: '2.0', id: ..., result: ... } or { jsonrpc: '2.0', id: ..., error: ... }
    const jsonRpcResponse = await apiService.post<{
      jsonrpc?: string;
      id?: string | number | null;
      result?: JsonValue;
      error?: {
        code: number;
        message: string;
        data?: unknown;
      };
    }, JsonObject>(url, payload);

    // Handle JSON-RPC error response
    if (jsonRpcResponse.error) {
      const errorMessage = jsonRpcResponse.error.message || 'API request failed';
      console.error('❌ [TasksService] JSON-RPC error response:', jsonRpcResponse.error);
      throw new Error(errorMessage);
    }

    // Extract result from JSON-RPC envelope
    // The API returns: { jsonrpc: '2.0', id: ..., result: TaskResponseDto }
    // But we need to return: { taskId, conversationId, status, result: TaskResponseDto }
    // The TaskResponseDto contains the actual response data
    const taskResponseDto = jsonRpcResponse.result;
    
    if (!taskResponseDto) {
      console.error('❌ [TasksService] No result in JSON-RPC response:', jsonRpcResponse);
      throw new Error('No result in JSON-RPC response');
    }

    // Extract taskId and conversationId from the TaskResponseDto metadata
    // The API adds taskId to dto.metadata before execution (line 419 in controller)
    // TaskResponseDto structure: { success, mode, payload: { content, metadata: { taskId, conversationId, ... } }, humanResponse? }
    const taskResponse = taskResponseDto as {
      success?: boolean;
      payload?: {
        metadata?: Record<string, unknown>;
      };
    };
    const metadata = taskResponse?.payload?.metadata || {};
    
    // Extract taskId - API adds it to payload.metadata.taskId (from dto.metadata.taskId)
    // Also check streaming metadata and JSON-RPC id as fallbacks
    const streamingMetadata = (metadata.streaming as Record<string, unknown> | undefined) || {};
    const taskId = (metadata.taskId as string) || 
                   (streamingMetadata.taskId as string) ||
                   (jsonRpcResponse.id?.toString() || '');
    
    // Extract conversationId from metadata or streaming metadata
    const conversationId = (metadata.conversationId as string) || 
                          (metadata.conversation_id as string) ||
                          (streamingMetadata.conversationId as string) || '';
    
    // Extract status - default to 'completed' if success, 'failed' otherwise
    const taskResponseSuccess = taskResponse?.success ?? true;
    const status: TaskStatus = (metadata.status as TaskStatus) || 
                              (taskResponseSuccess ? 'completed' : 'failed');

    // Return in the expected format with result containing the full TaskResponseDto
    // Actions will access the TaskResponseDto via result.result
    return {
      taskId,
      conversationId,
      status,
      result: taskResponseDto, // This is the TaskResponseDto that actions will access via result.result
    };
  }
  /**
   * Get task by ID (alias for getTask)
   */
  async getTaskById(taskId: string): Promise<TaskDetail> {
    return this.getTask(taskId);
  }
  /**
   * Evaluate task
   */
  async evaluateTask(taskId: string, evaluation: TaskEvaluation): Promise<TaskDetail> {
    const response = await apiService.post<TaskDetail, TaskEvaluation>(`/evaluation/tasks/${taskId}`, evaluation);
    return response;
  }
  /**
   * Get task evaluation
   */
  async getTaskEvaluation(taskId: string): Promise<TaskDetail> {
    const response = await apiService.get<TaskDetail>(`/evaluation/tasks/${taskId}`);
    return response;
  }
  /**
   * Update task evaluation
   */
  async updateTaskEvaluation(taskId: string, evaluation: TaskEvaluation): Promise<TaskDetail> {
    const response = await apiService.put<TaskDetail, TaskEvaluation>(`/evaluation/tasks/${taskId}`, evaluation);
    return response;
  }
  /**
   * Get conversation task evaluations
   */
  async getConversationTaskEvaluations(
    conversationId: string,
    filters?: { minRating?: number; hasNotes?: boolean }
  ): Promise<TaskDetail[]> {
    const queryParams = new URLSearchParams();
    if (filters?.minRating) queryParams.append('minRating', filters.minRating.toString());
    if (filters?.hasNotes) queryParams.append('hasNotes', filters.hasNotes.toString());
    const url = queryParams.toString() 
      ? `/evaluation/conversations/${conversationId}/tasks?${queryParams.toString()}`
      : `/evaluation/conversations/${conversationId}/tasks`;
    const response = await apiService.get<TaskDetail[]>(url);
    return response;
  }
}
export const tasksService = new TasksService();
export default tasksService;
