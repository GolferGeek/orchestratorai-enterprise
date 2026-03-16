// Agent organizational categories - supports both file structure and explicit configuration
// Common values include: orchestrator, specialist, marketing, finance, hr, operations,
// sales, legal, engineering, product, research, context, function, tool
// Also supports any string for organization slugs (my-org, etc.)
export type AgentType = string;

export interface AgentConversation {
  id: string;
  userId: string;
  agentName: string;
  agentType: AgentType;
  organizationSlug?: string | null; // Organization identifier for database agents (e.g., "my-org")
  startedAt: Date;
  endedAt?: Date;
  lastActiveAt: Date;
  metadata?: Record<string, unknown>;
  workProduct?: WorkProductContext; // Optional 1:1 bound work product
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  agentConversationId: string | null; // Nullable to support lazy conversation creation
  userId: string;
  // Request fields
  method: string;
  prompt: string;
  params?: Record<string, unknown>;
  // Response fields
  response?: string;
  responseMetadata?: Record<string, unknown>;
  // Status tracking
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  progressMessage?: string;
  // Evaluation fields
  evaluation?: Record<string, unknown>;
  llmMetadata?: Record<string, unknown>;
  // PII Processing metadata
  piiMetadata?: import('@/llms/types/pii-metadata.types').PIIProcessingMetadata;
  // Error tracking
  errorCode?: string;
  errorMessage?: string;
  errorData?: Record<string, unknown>;
  // Timing
  startedAt?: Date;
  completedAt?: Date;
  timeoutSeconds: number;
  // Metadata
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentConversationWithStats extends AgentConversation {
  taskCount: number;
  completedTasks: number;
  failedTasks: number;
  activeTasks: number;
}

export interface CreateAgentConversationDto {
  agentName: string;
  agentType: AgentType;
  organization?: string; // Organization slug for database agents (e.g., 'my-org')
  conversationId?: string; // Pre-generated UUID from frontend — used as record id
  metadata?: Record<string, unknown>;
  workProduct?: WorkProductContext;
}

export interface LLMSelection {
  providerName?: string;
  modelName?: string;
  cidafmOptions?: {
    activeStateModifiers?: string[];
    responseModifiers?: string[];
    executedCommands?: string[];
    customOptions?: Record<string, unknown>;
  };
  temperature?: number;
  maxTokens?: number;
}

export interface WorkProductContext {
  type: 'deliverable';
  id: string;
  version?: number;
  state?: unknown;
}

export interface CreateTaskDto {
  method: string;
  prompt: string;
  params?: {
    workProduct?: WorkProductContext;
  } & Record<string, unknown>;
  conversationId?: string; // Optional, creates new conversation if not provided
  taskId?: string; // Optional, pre-generated task ID from frontend to enable early WebSocket subscription
  timeoutSeconds?: number;
  llmSelection?: LLMSelection; // LLM and CIDAFM configuration
  llmMetadata?: Record<string, unknown>; // Additional metadata such as context optimization details
  executionMode?: 'immediate' | 'polling' | 'real-time'; // Execution mode for backend processing (real-time uses SSE)
  conversationHistory?: Array<{
    role: string;
    content: string;
    timestamp: string;
    taskId?: string;
    metadata?: Record<string, unknown>;
  }>; // Conversation history array passed from frontend
  metadata?: Record<string, unknown>; // Context metadata for deliverable operations
}

export interface UpdateTaskDto {
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  progressMessage?: string;
  response?: string;
  responseMetadata?: Record<string, unknown>;
  evaluation?: Record<string, unknown>;
  llmMetadata?: Record<string, unknown>;
  piiMetadata?: import('@/llms/types/pii-metadata.types').PIIProcessingMetadata;
  errorCode?: string;
  errorMessage?: string;
  errorData?: Record<string, unknown>;
}

export interface TaskProgressEvent {
  taskId: string;
  progress: number;
  message?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  metadata?: Record<string, unknown>;
}

export interface WorkflowStepProgressEvent {
  taskId: string;
  stepName: string;
  stepIndex: number;
  totalSteps: number;
  status: string;
  message?: string;
}

export interface AgentConversationQueryParams {
  userId?: string;
  agentName?: string;
  agentType?: string;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface TaskQueryParams {
  conversationId?: string;
  userId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}
