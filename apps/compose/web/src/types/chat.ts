// Simplified types to avoid infinite type instantiation with JsonObject/JsonValue
type SimpleJsonValue =
  | string
  | number
  | boolean
  | null
  | Record<string, unknown>
  | unknown[];
type SimpleJsonObject = Record<string, unknown>;

export type MessageSender = "user" | "agent" | "system";
export type MessageDisplayType =
  | "text"
  | "agentList"
  | "workflow_progress"
  | "deliverable";
export interface ChatMessage {
  id: string;
  text?: string;
  sender: MessageSender;
  agentName?: string;
  timestamp: Date;
  messageType?: MessageDisplayType;
  data?: SimpleJsonValue;
  // Workflow-specific fields
  workflowStep?: string;
  stepIndex?: number;
  totalSteps?: number;
  deliverableType?:
    | "document"
    | "analysis"
    | "report"
    | "plan"
    | "requirements";
  // Potentially add more fields later, e.g., message status (sending, sent, error)
}
// Interface for workflow progress messages
export interface WorkflowProgressMessage {
  stepName: string;
  stepIndex: number;
  totalSteps: number;
  status: "pending" | "in_progress" | "completed" | "failed";
  message?: string;
  metadata?: SimpleJsonObject;
  timestamp: Date;
}
// Interface for deliverable messages
export interface DeliverableMessage {
  title: string;
  content: string;
  deliverableType: "document" | "analysis" | "report" | "plan" | "requirements";
  format: "markdown" | "text" | "json" | "html";
  metadata?: SimpleJsonObject;
  downloadable?: boolean;
  timestamp: Date;
}
// Interface for workflow state
export interface WorkflowState {
  workflowId: string;
  currentStep: string;
  stepIndex: number;
  totalSteps: number;
  status: "pending" | "running" | "completed" | "failed";
  steps: WorkflowProgressMessage[];
  deliverables: DeliverableMessage[];
  metadata?: SimpleJsonObject;
}
// Interface for an agent (relevant for agent store later, but good to think about types together)
export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  type?: string;
  slug?: string;
  organizationSlug?: string | null;
  execution_modes?: ("immediate" | "polling" | "real-time" | "auto")[];
  execution_profile?:
    | "conversation_only"
    | "autonomous_build"
    | "human_gate"
    | "conversation_with_gate";
  execution_capabilities?: {
    can_converse: boolean;
    can_plan: boolean;
    can_build: boolean;
    requires_human_gate: boolean;
  };
  plan_structure?: SimpleJsonObject | null;
  deliverable_structure?: SimpleJsonObject | null;
  io_schema?: {
    input?: SimpleJsonObject;
    output?: SimpleJsonObject;
  } | null;
  // Custom UI fields (for agents like Marketing Swarm that have their own UI)
  hasCustomUI?: boolean;
  customUIComponent?: string | null;
  // Sovereign mode - when true, only local LLM providers (Ollama) allowed
  requireLocalModel?: boolean;
  // LLM configuration from agents table - used to set ExecutionContext provider/model
  llm_config?: { provider: string; model: string } | null;
  // Media agent configuration (for image/video generation agents)
  metadata?: {
    agent_type?: string;
    mediaType?: "image" | "video" | "audio";
    defaultProvider?: string;
    defaultModel?: string;
    supportedProviders?: string[];
    supportedModels?: Record<string, string[]>;
    [key: string]: SimpleJsonValue | undefined;
  } | null;
  // capabilities?: string[]; // Example
}
// Corrected TaskCreationRequest for /agents/orchestrator/tasks
// based on user confirmation that only the message object is sent.
export interface TaskCreationRequest {
  message: {
    role: "user";
    parts: Array<{
      text: string;
    }>;
  };
  session_id?: string | null; // Added optional session_id for context continuity
  // skill and agent_id are removed as per user clarification
}
// Represents a part of a message (e.g., text, image)
export interface TaskMessagePart {
  type: string; // e.g., 'text', 'image'
  text?: string; // For text parts
  url?: string; // For image parts
  alt_text?: string;
  content?: SimpleJsonValue; // For generic artifact parts
  encoding?: string;
  // Allow other properties from backend
  [key: string]: SimpleJsonValue | undefined;
}
// Represents a message within a task (request or response)
export interface TaskMessage {
  role: string; // "user", "agent", "system"
  parts: TaskMessagePart[];
  artifacts?: SimpleJsonObject[];
  timestamp?: string; // ISO 8601
  metadata?: SimpleJsonObject | null; // For agent_name or other info
  // Allow other properties from backend
  [key: string]: SimpleJsonValue | undefined;
}
// Updated TaskResponse to closely match backend Pydantic Task model
export interface TaskResponse {
  id: string;
  status: {
    state: string;
    timestamp: string;
    message?: string;
  };
  request_message?: TaskMessage;
  response_message?: TaskMessage | null;
  history?: TaskMessage[];
  artifacts?: SimpleJsonObject[];
  session_id?: string | null;
  metadata?: SimpleJsonObject | null;
  created_at: string;
  updated_at: string;
  // A2A Protocol V2 fields
  output_artifacts?: Array<{
    type: string;
    artifact_id: string;
    artifact_type: string;
    format?: string;
    data: string;
    encoding?: string;
    metadata?: SimpleJsonObject;
    size?: number;
    checksum?: string;
  }>;
  input_artifacts?: Array<{
    type: string;
    artifact_id: string;
    artifact_type: string;
    format?: string;
    data: SimpleJsonValue;
    encoding?: string;
    metadata?: SimpleJsonObject;
    size?: number;
    checksum?: string;
  }>;
  error_details?: {
    code?: string;
    message?: string;
    details?: SimpleJsonObject;
  };
  progress?: {
    percentage?: number;
    current_step?: string;
    total_steps?: number;
    estimated_remaining?: number;
  };
  // Additional fallback fields for backward compatibility
  result?: string;
  title?: string;
  description?: string;
  instructions?: string;
  priority?: string;
  due_date?: string;
  created_by?: string;
  assigned_to?: string;
  estimated_duration?: number;
  actual_duration?: number;
  dependencies?: string[];
  tags?: string[];
  context?: SimpleJsonObject;
  // Legacy fields for V1 compatibility
  task_id?: string;
  respondingAgentName?: string;
}
