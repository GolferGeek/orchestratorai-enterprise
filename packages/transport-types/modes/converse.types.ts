/**
 * Converse Mode Types
 * Defines mode-specific payloads and metadata for conversational interactions
 */

/**
 * Converse Mode Payload
 * Converse mode typically doesn't have actions, just conversational interaction
 */
export interface ConverseModePayload {
  /** Optional temperature for conversation behavior (defaults to model default) */
  temperature?: number;
  /** Max tokens for response (optional - defaults to model default) */
  maxTokens?: number;
  /** Stop sequences (optional) */
  stop?: string[];
  /** Interaction mode — voice responses are ultra-concise (2-3 sentences) */
  interactionMode?: 'voice' | 'text';
}

/**
 * Converse Request Metadata
 * Note: userId, conversationId, provider, model are in ExecutionContext
 */
export interface ConverseRequestMetadata {
  /** Source of the request (e.g., 'web-ui', 'api', 'cli') */
  source: string;
  /** Additional conversation context (optional) */
  additionalContext?: string;
  /** Current sub-agent handling the request (for orchestrator delegation) */
  current_sub_agent?: string | null;
}

/**
 * Converse Response Metadata
 */
export interface ConverseResponseMetadata {
  /** LLM provider used (REQUIRED) */
  provider: string;
  /** LLM model used (REQUIRED) */
  model: string;
  /** Token usage statistics (REQUIRED) */
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
  };
  /** Routing decision information (optional) */
  routingDecision?: Record<string, any>;
  /** Stream ID if streaming was used (optional) */
  streamId?: string;
  /** Current sub-agent that handled the request (for orchestrator delegation) */
  current_sub_agent?: string | null;
}

/**
 * Converse Response Content
 */
export interface ConverseResponseContent {
  /** The assistant's message (REQUIRED) */
  message: string;
}
