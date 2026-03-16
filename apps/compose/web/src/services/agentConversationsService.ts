import type { JsonObject } from '@orchestrator-ai/transport-types';
import { apiService } from './apiService';
// Agent organizational categories - supports business-aligned structure
type AgentType = 
  | 'orchestrator'    // Special type for delegation and management
  | 'specialist'      // Cross-organizational specialists
  | 'marketing'       // Marketing department agents
  | 'finance'         // Finance department agents  
  | 'hr'              // Human resources agents
  | 'operations'      // Operations and logistics agents
  | 'sales'           // Sales and customer-facing agents
  | 'legal'           // Legal and compliance agents
  | 'engineering'     // Engineering and technical agents
  | 'product'         // Product management agents
  | 'research';       // Research and analytics agents
interface AgentConversation {
  id: string;
  userId: string;
  agentName: string;
  agentType: AgentType;
  startedAt: string;
  endedAt?: string;
  lastActiveAt: string;
  metadata?: JsonObject;
  createdAt: string;
  updatedAt: string;
  taskCount?: number;
  completedTasks?: number;
  failedTasks?: number;
  activeTasks?: number;
}
interface CreateAgentConversationDto {
  agentName: string;
  agentType: AgentType;
  metadata?: JsonObject;
}
interface AgentConversationQueryParams {
  userId?: string;
  agentName?: string;
  agentType?: string;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}
interface ListConversationsResponse {
  conversations: AgentConversation[];
  total: number;
}
class AgentConversationsService {
  private readonly baseUrl = '/agent-conversations';
  /**
   * List agent conversations
   */
  async listConversations(params?: AgentConversationQueryParams): Promise<ListConversationsResponse> {
    const queryParams = new URLSearchParams();
    if (params?.agentName) queryParams.append('agentName', params.agentName);
    if (params?.agentType) queryParams.append('agentType', params.agentType);
    if (params?.activeOnly) queryParams.append('activeOnly', 'true');
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    const url = queryParams.toString() 
      ? `${this.baseUrl}?${queryParams.toString()}`
      : this.baseUrl;
    const response = await apiService.get<ListConversationsResponse>(url);
    return response;
  }
  /**
   * Get conversation by ID
   */
  async getConversation(conversationId: string): Promise<AgentConversation> {
    const response = await apiService.get<AgentConversation>(`${this.baseUrl}/${conversationId}`);
    return response;
  }
  /**
   * Create a new conversation
   */
  async createConversation(dto: CreateAgentConversationDto): Promise<AgentConversation> {
    const response = await apiService.post<AgentConversation, CreateAgentConversationDto>(this.baseUrl, dto);
    return response;
  }
  /**
   * End a conversation
   */
  async endConversation(conversationId: string): Promise<{ success: boolean }> {
    const response = await apiService.put<{ success: boolean }>(`${this.baseUrl}/${conversationId}/end`);
    return response;
  }
  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<{ success: boolean }> {
    const response = await apiService.delete<{ success: boolean }>(`${this.baseUrl}/${conversationId}`);
    return response;
  }
  /**
   * Update conversation metadata
   */
  async updateConversationMetadata(
    conversationId: string, 
    metadata: JsonObject
  ): Promise<{ success: boolean }> {
    const response = await apiService.put<{ success: boolean }, JsonObject>(
      `${this.baseUrl}/${conversationId}/metadata`,
      metadata
    );
    return response;
  }
  /**
   * Get active conversations
   */
  async getActiveConversations(): Promise<AgentConversation[]> {
    const response = await apiService.get<AgentConversation[]>(`${this.baseUrl}/active`);
    return response;
  }
}
export const agentConversationsService = new AgentConversationsService();
export default agentConversationsService;
export type { AgentType };
