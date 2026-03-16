// API Configuration Types
import type { JsonValue } from '@orchestrator-ai/transport-types';
import type { AgentInfo, TaskResponse } from './chat';
import type { ConversationHistoryEntry } from './conversation';

export type ApiVersion = 'v1' | 'v2';
export type ApiTechnology = 'typescript-nestjs';
export interface ApiEndpoint {
  version: ApiVersion;
  technology: ApiTechnology;
  baseUrl: string;
  name: string;
  description: string;
  features: string[];
  isAvailable: boolean;
}
export interface ApiConfiguration {
  currentEndpoint: ApiEndpoint;
  availableEndpoints: ApiEndpoint[];
  defaultEndpoint: ApiEndpoint;
}
// API Client Interface
export interface ApiClient {
  // Core methods that all API versions should support
  postTaskToOrchestrator(
    userInputText: string, 
    sessionId?: string | null, 
    conversationHistory?: ConversationHistoryEntry[]
  ): Promise<TaskResponse>;
  getAvailableAgents(): Promise<AgentInfo[]>;
  // Authentication
  setAuthToken?(token: string | null): void;
  // Metadata
  getEndpointInfo(): ApiEndpoint;
  isFeatureSupported(feature: string): boolean;
  // Health check
  healthCheck(): Promise<boolean>;
}
// Feature flags for different API capabilities
export const API_FEATURES = {
  ORCHESTRATOR: 'orchestrator',
  AGENT_DISCOVERY: 'agent_discovery',
  SESSION_MANAGEMENT: 'session_management',
  HIERARCHICAL_AGENTS: 'hierarchical_agents',
  REAL_TIME_CHAT: 'real_time_chat',
  FILE_UPLOAD: 'file_upload',
  VOICE_SUPPORT: 'voice_support',
  MULTI_MODAL: 'multi_modal'
} as const;
export type ApiFeature = typeof API_FEATURES[keyof typeof API_FEATURES];
// Error handling
export interface ApiError {
  message: string;
  code?: string;
  statusCode?: number;
  details?: JsonValue;
  endpoint?: string;
}
// Response wrapper for consistent error handling
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  metadata?: {
    version: ApiVersion;
    technology: ApiTechnology;
    timestamp: string;
  };
} 
