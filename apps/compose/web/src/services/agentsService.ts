/**
 * Agents Service
 *
 * Handles all agent-related API calls.
 * Components/stores should use this service for agent data operations.
 */

import { apiService } from './apiService';
import type { AgentInfo } from '../types/chat';
import type { AgentHierarchyResponse } from '@/types/agent';

class AgentsService {
  /**
   * Get all available agents
   */
  async getAvailableAgents(organization?: string): Promise<AgentInfo[]> {
    return apiService.getAvailableAgents(organization);
  }

  /**
   * Get agent hierarchy for a specific organization (or all if not specified)
   */
  async getAgentHierarchy(organization?: string): Promise<AgentHierarchyResponse> {
    return apiService.getAgentHierarchy(organization);
  }

  /**
   * Get a specific agent by name
   */
  async getAgent(agentName: string): Promise<AgentInfo | null> {
    const agents = await this.getAvailableAgents();
    return agents.find(agent => agent.name === agentName) || null;
  }
}

export const agentsService = new AgentsService();
export default agentsService;
