/**
 * Conversation Types
 *
 * Types for agent conversations, messages, and execution modes.
 * Migrated from stores/agentChatStore/types.ts
 */

import type {
  DeliverableData,
  DeliverableVersionData,
  JsonObject,
  JsonValue,
  PlanData,
  PlanVersionData,
} from '@orchestrator-ai/transport-types';
import type { LLMSelection } from './llm';
import type { MessageMetadata } from './message';

export const PRIMARY_CHAT_MODES = ['converse', 'plan', 'build'] as const;
export type PrimaryChatMode = typeof PRIMARY_CHAT_MODES[number];

export type AgentChatMode =
  | PrimaryChatMode
  | 'orchestrate_create'
  | 'orchestrate_execute'
  | 'orchestrate_continue'
  | 'orchestrate_save_recipe';

export const DEFAULT_CHAT_MODES: AgentChatMode[] = [...PRIMARY_CHAT_MODES];

// Agent interface based on the original implementation
export type AgentExecutionProfile =
  | 'conversation_only'
  | 'autonomous_build'
  | 'human_gate'
  | 'conversation_with_gate';

export interface AgentExecutionCapabilities {
  can_converse: boolean;
  can_plan: boolean;
  can_build: boolean;
  requires_human_gate: boolean;
}

export interface AgentLLMConfig {
  provider: string;
  model: string;
  parameters?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  };
}

export interface Agent {
  name: string;
  type: string;
  slug?: string;
  id?: string;
  description?: string;
  organizationSlug?: string | null;
  execution_modes?: string[];
  execution_profile?: AgentExecutionProfile;
  execution_capabilities?: AgentExecutionCapabilities;
  plan_structure?: JsonObject | null;
  deliverable_structure?: JsonObject | null;
  io_schema?: {
    input?: JsonObject;
    output?: JsonObject;
  } | null;
  /** LLM configuration from agents table - used to set ExecutionContext when agent is selected */
  llm_config?: AgentLLMConfig | null;
}

export interface ConversationPlanRecord {
  id: string;
  conversation_id: string;
  organization_slug: string | null;
  agent_slug: string;
  status: string;
  summary: string | null;
  plan_json: JsonObject;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface OrchestrationRunRecord {
  id: string;
  plan_id: string | null;
  origin_type: string;
  origin_id: string | null;
  orchestration_slug: string | null;
  organization_slug: string | null;
  status: string;
  prompt_inputs?: JsonObject;
  current_step_index?: number | null;
  completed_steps?: JsonObject[];
  step_state?: JsonObject;
  human_checkpoint_id?: string | null;
  metadata?: JsonObject;
  started_at: string;
  completed_at: string | null;
}

export interface AgentOrchestrationRecord {
  id: string;
  organization_slug: string | null;
  agent_slug: string;
  slug: string;
  display_name: string;
  description: string | null;
  status: string;
  orchestration_json: JsonObject;
  prompt_templates?: JsonObject[];
  tags?: string[];
  version?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentTaskResponse {
  success: boolean;
  mode: string;
  payload?: {
    content?: JsonValue;
    metadata?: JsonObject;
  };
  humanResponse?: {
    message: string;
    reason?: string;
  };
}

export interface AgentChatWorkflowStep {
  stepName: string;
  stepIndex: number;
  totalSteps: number;
  status: string;
  message?: string;
  timestamp?: string;
}

export interface AgentChatCompletedStepSummary {
  name: string;
  message: string;
  index: number;
  total: number;
}

export interface LLMRunConfiguration {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentChatMessageMetadata extends MessageMetadata {
  isPlaceholder?: boolean;
  isCompleted?: boolean;
  processingCompletion?: boolean;
  completedAt?: string;
  approvalStatus?: 'approved' | 'rejected' | 'pending' | string;
  approvedAt?: string;
  decisionAt?: string;
  humanRequired?: boolean;
  mode?: AgentChatMode | string;
  deliverableId?: string;
  planId?: string;
  enhancedDeliverableId?: string;
  enhancedFromVersionId?: string;
  completedSteps?: AgentChatCompletedStepSummary[];
  workflow_steps_realtime?: AgentChatWorkflowStep[];
  processing_type?: string;
  lastUpdated?: string;
  messageCount?: number;
  allMessages?: AgentChatMessage[];
  provider?: string;
  model?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalCost?: number;
    responseTimeMs?: number;
  };
  costCalculation?: {
    inputTokens?: number;
    outputTokens?: number;
    inputCost?: number;
    outputCost?: number;
    totalCost?: number;
    currency?: string;
  };
  llmMetadata?: JsonObject;
  llmUsed?: JsonObject;
  isRerunRequest?: boolean;
  isRerunResponse?: boolean;
  isRerunError?: boolean;
  isRegeneratedPrompt?: boolean;
  originalVersionId?: string;
  newVersionId?: string;
  sourceVersionId?: string;
  rerunLLMConfig?: LLMRunConfiguration;
  errorDetails?: string;
  /**
   * Container for auxiliary metadata that does not yet have a dedicated field.
   */
  extra?: JsonObject;

  // Marketing Swarm metadata
  marketingSwarmTaskId?: string;
  marketingSwarmCompleted?: boolean;
  taskId?: string;

  // Sub-agent attribution (Orchestrator V2)
  resolvedByDisplayName?: string;

  // HITL processing flag
  hitlProcessing?: boolean;
}

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  taskId?: string;
  deliverableId?: string;
  planId?: string;
  metadata?: AgentChatMessageMetadata;
}

export interface AgentConversation {
  id: string;
  agent: Agent;
  agentName?: string;
  agentType?: string;
  organizationSlug?: string | null;
  messages: AgentChatMessage[];
  createdAt: Date;
  lastActiveAt: Date;
  // Conversation mode controls high-level intent
  chatMode: AgentChatMode;
  allowedChatModes: AgentChatMode[];
  executionMode: 'immediate' | 'polling' | 'real-time' | 'auto';
  supportedExecutionModes: ('immediate' | 'polling' | 'real-time' | 'auto')[];
  isExecutionModeOverride?: boolean;
  executionProfile?: AgentExecutionProfile;
  executionCapabilities?: AgentExecutionCapabilities;
  error?: string;
  latestPlanId?: string | null;
  latestPlan?: ConversationPlanRecord | null;
  plans?: ConversationPlanRecord[];
  // New mode × action architecture state
  currentPlan?: PlanData | null;
  planVersions?: PlanVersionData[];
  currentDeliverable?: DeliverableData | null;
  deliverableVersions?: DeliverableVersionData[];
  orchestrationRuns?: OrchestrationRunRecord[];
  savedOrchestrations?: AgentOrchestrationRecord[];
  streamSubscriptions?: Record<string, { messageId: string; unsubscribe: () => void }>;
  // Additional properties from original interface
  title: string;
  isLoading: boolean;
  isSendingMessage: boolean;
  activeTaskId?: string | null;
}

export type ExecutionMode = 'immediate' | 'polling' | 'real-time' | 'auto';

export interface TaskExecutionOptions {
  method: string;
  prompt: string;
  conversationId: string;
  conversationHistory: ConversationHistoryEntry[];
  llmSelection: LLMSelection;
  executionMode: ExecutionMode;
  agentType: string;
  agentName: string;
  taskId?: string;
  mode?: AgentChatMode;
  timeoutSeconds?: number;
  metadata?: JsonObject; // Context metadata for version operations
  agentOrganization?: string | null;
}

export interface PendingAction {
  type: 'plan' | 'build';
  expiresAt: number; // epoch ms
  sourceTaskId?: string;
}

export interface DeliverableOptions {
  taskId: string;
  content: string;
  existingContent: string;
  messageMetadata?: AgentChatMessageMetadata;
}

export interface ProgressUpdate {
  taskId: string;
  status: string;
  progress: number;
  progressMessage?: string;
  data?: JsonObject;
}

export interface TaskCompletionEvent {
  taskId: string;
  conversationId: string;
  status: 'completed' | 'failed';
}

export interface WorkflowStepEvent {
  taskId: string;
  stepName: string;
  stepIndex: number;
  totalSteps: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  message?: string;
  metadata?: JsonObject;
}

export interface ConversationHistoryEntry {
  role: string;
  content: string;
  metadata?: AgentChatMessageMetadata;
}
