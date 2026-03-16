/**
 * A2A Task Request Types
 * Defines the structure of task requests in the A2A protocol
 */

import { AgentTaskMode } from '../shared/enums';
import { ExecutionContext } from '../core/execution-context';

/**
 * Message in a conversation
 */
export interface TaskMessage {
  /** Role of the message sender (e.g., 'user', 'assistant', 'system') */
  role: string;

  /** Content of the message */
  content: any;
}

/**
 * Task Request Parameters (A2A Extension to JSON-RPC)
 * This is what goes in the `params` field of a JSON-RPC request
 */
export interface TaskRequestParams {
  /**
   * Execution context - contains orgSlug, userId, conversationId, taskId, provider, model, etc.
   * This is the single source of truth for all context-related data (REQUIRED)
   */
  context: ExecutionContext;

  /**
   * The operational mode for the agent (REQUIRED)
   * Note: In JSON-RPC, this is derived from the `method` field
   * but can also be explicitly set in params
   */
  mode: AgentTaskMode;

  /**
   * Session identifier for grouping related requests (optional)
   */
  sessionId?: string;

  /**
   * Plan identifier for plan-related operations (optional)
   */
  planId?: string;

  /**
   * Orchestration identifier (optional)
   */
  orchestrationId?: string;

  /**
   * Orchestration run identifier (optional)
   */
  orchestrationRunId?: string;

  /**
   * Orchestration slug for named orchestrations (optional)
   */
  orchestrationSlug?: string;

  /**
   * Action-specific parameters and configuration (REQUIRED)
   * This is where mode/action-specific data goes
   */
  payload: {
    /**
     * The action to perform within the mode (e.g., 'create', 'read', 'update', 'delete')
     */
    action: string;

    /**
     * Additional action-specific parameters
     */
    [key: string]: any;
  };

  /**
   * Parameters for prompt template interpolation (optional)
   */
  promptParameters?: Record<string, any>;

  /**
   * User's message or prompt (REQUIRED)
   * Can be empty string for non-conversational actions
   */
  userMessage: string;

  /**
   * Conversation history (array of messages) (optional)
   */
  messages?: TaskMessage[];
}

/**
 * Complete A2A Task Request (JSON-RPC 2.0 + A2A params)
 */
export interface A2ATaskRequest {
  /** JSON-RPC version (always "2.0") */
  jsonrpc: '2.0';

  /** Request identifier (REQUIRED) */
  id: string | number | null;

  /** Method name (maps to AgentTaskMode) */
  method: string;

  /** A2A task request parameters (REQUIRED) */
  params: TaskRequestParams;
}
