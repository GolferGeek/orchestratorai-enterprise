import type { JsonObject, JsonValue } from '@orchestrator-ai/transport-types';
import { BaseApiClient } from './baseApiClient';
import { ApiEndpoint } from '../../types/api';
import { TaskResponse, AgentInfo } from '../../types/chat';

type ConversationHistoryItem = {
  role: string;
  content: string;
  metadata?: JsonObject;
};

type OrchestratorTaskResult = JsonObject & {
  success?: boolean;
  metadata?: JsonObject;
  content?: string;
  response?: string;
  message?: string;
  result?: string;
};

type LLMContentCarrier = {
  content?: string;
  response?: string;
  message?: string;
  result?: string;
};

const extractLLMContent = (payload: LLMContentCarrier | null | undefined, fallback = 'Task completed'): string => {
  if (!payload) {
    return fallback;
  }

  const candidates = [payload.content, payload.response, payload.message, payload.result];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return fallback;
};

interface JsonRpcResponse<Result = JsonValue> {
  jsonrpc: '2.0';
  result?: Result;
  error?: {
    code: number;
    message: string;
    data?: JsonValue;
  };
  id: string | number | null;
}
export class ApiClient extends BaseApiClient {
  constructor(endpoint: ApiEndpoint) {
    super(endpoint);
  }
  async postTaskToOrchestrator(
    userInputText: string, 
    sessionId?: string | null,
    conversationHistory?: ConversationHistoryItem[] 
  ): Promise<TaskResponse> {
    // Get the current auth token from storage to pass to orchestrator
    // TokenStorageService migrates tokens to sessionStorage, so check there first
    const authToken = sessionStorage.getItem('authToken') || localStorage.getItem('authToken');
    // Get current user information for proper database RLS
    let currentUser = null;
    if (authToken) {
      try {
        // Ensure auth token is set in headers for the /auth/me request
        const userResponse = await this.axiosInstance.get('/auth/me', {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        });
        currentUser = userResponse.data.user;
      } catch {
        // Failed to fetch current user for orchestrator
      }
    }
    // NestJS JSON-RPC 2.0 format
    const requestPayload = {
      jsonrpc: '2.0',
      method: 'handle_request',
      params: {
        message: userInputText,
        session_id: sessionId,
        conversation_history: conversationHistory || [],
        authToken: authToken, // Pass auth token to orchestrator for agent pool refresh
        currentUser: currentUser // Pass current user for database RLS
      },
      id: Date.now() // Use timestamp as unique ID
    };
    const response = await this.axiosInstance.post<JsonRpcResponse<OrchestratorTaskResult>>(
      '/agents/orchestrator/orchestrator/tasks',
      requestPayload
    );
    // Extract the result field and convert to TaskResponse
    const jsonRpcResponse = response.data;
    if (jsonRpcResponse.error) {
      throw new Error(`JSON-RPC Error ${jsonRpcResponse.error.code}: ${jsonRpcResponse.error.message}`);
    }
    if (jsonRpcResponse.result) {
      const result = jsonRpcResponse.result;
      // Extract agent name from various possible metadata fields
      let respondingAgentName = 'Orchestrator Agent'; // default
      if (result.metadata) {
        // Try different fields where agent name might be
        const originalAgent = result.metadata.originalAgent as JsonObject | undefined;
        respondingAgentName = (result.metadata.delegatedTo as string) ||
                            (originalAgent?.agentName as string) ||
                            (result.metadata.agentName as string) ||
                            (result.metadata.respondingAgentName as string) ||
                            'Orchestrator Agent';
      }
      return {
        id: jsonRpcResponse.id?.toString() || Date.now().toString(),
        status: {
          state: result.success ? 'completed' : 'failed',
          timestamp: new Date().toISOString(),
          message: result.success ? 'Task completed successfully' : 'Task failed'
        },
        result: extractLLMContent(result, 'Success'),
        metadata: {
          agentName: respondingAgentName,
          respondingAgentName: respondingAgentName,
          ...result.metadata
        },
        response_message: {
          role: 'assistant',
          parts: [{
            type: 'text',
            text: extractLLMContent(result, 'Task completed')
          }],
          metadata: {
            respondingAgentName: respondingAgentName
          }
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        session_id: sessionId || null
      };
    }
    throw new Error('No result received from orchestrator');
  }
  async getAvailableAgents(): Promise<AgentInfo[]> {
    const response = await this.axiosInstance.get<{ agents: AgentInfo[] }>('/agents');
    return response.data.agents || [];
  }
  // V1-specific methods can be added here
  async getAgentDetails(agentId: string): Promise<AgentInfo> {
    const response = await this.axiosInstance.get<AgentInfo>(`/agents/${agentId}`);
    return response.data;
  }
  async getTaskHistory(sessionId: string): Promise<TaskResponse[]> {
    const response = await this.axiosInstance.get<TaskResponse[]>(`/sessions/${sessionId}/tasks`);
    return response.data;
  }
} 
