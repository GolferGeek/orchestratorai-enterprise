/**
 * agent2AgentConversationsService.ts
 *
 * Compose-scoped A2A Conversations Service.
 * Wraps the base agentConversationsService to support extended creation params
 * including pre-generated conversationId and organizationSlug.
 *
 * This service is used by conversationCrudService to create conversations.
 * ExecutionContext initialization happens in conversationCrudService after creation.
 */

import { apiService } from './apiService';
import type { JsonObject } from '@orchestrator-ai/transport-types';

export type AgentType =
  | 'orchestrator'
  | 'specialist'
  | 'context'
  | 'function'
  | 'api'
  | 'external'
  | 'media'
  | 'marketing'
  | 'finance'
  | 'hr'
  | 'operations'
  | 'sales'
  | 'legal'
  | 'engineering'
  | 'product'
  | 'research';

export interface CreateA2AConversationDto {
  agentName: string;
  agentType: AgentType;
  organizationSlug?: string;
  conversationId?: string;
  metadata?: JsonObject;
}

export interface A2AConversation {
  id: string;
  userId?: string;
  agentName: string;
  agentType: AgentType;
  organizationSlug?: string;
  title?: string;
  startedAt: string;
  endedAt?: string;
  lastActiveAt: string;
  taskCount?: number;
  completedTasks?: number;
  failedTasks?: number;
  activeTasks?: number;
  metadata?: JsonObject;
  createdAt: string;
  updatedAt: string;
}

export interface ListA2AConversationsParams {
  limit?: number;
  offset?: number;
  agentName?: string;
  agentType?: string;
}

export interface ListA2AConversationsResponse {
  conversations: A2AConversation[];
  total: number;
}

class Agent2AgentConversationsService {
  private readonly baseUrl = '/agent-conversations';

  async listConversations(params?: ListA2AConversationsParams): Promise<ListA2AConversationsResponse> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.agentName) queryParams.append('agentName', params.agentName);
    if (params?.agentType) queryParams.append('agentType', params.agentType);
    const url = queryParams.toString()
      ? `${this.baseUrl}?${queryParams.toString()}`
      : this.baseUrl;
    return apiService.get<ListA2AConversationsResponse>(url);
  }

  async createConversation(dto: CreateA2AConversationDto): Promise<A2AConversation> {
    return apiService.post<A2AConversation, CreateA2AConversationDto>(this.baseUrl, dto);
  }

  async getConversation(conversationId: string): Promise<A2AConversation> {
    return apiService.get<A2AConversation>(`${this.baseUrl}/${conversationId}`);
  }

  async endConversation(conversationId: string): Promise<{ success: boolean }> {
    return apiService.put<{ success: boolean }>(`${this.baseUrl}/${conversationId}/end`);
  }

  async deleteConversation(conversationId: string): Promise<{ success: boolean }> {
    return apiService.delete<{ success: boolean }>(`${this.baseUrl}/${conversationId}`);
  }
}

const agent2AgentConversationsService = new Agent2AgentConversationsService();
export default agent2AgentConversationsService;
