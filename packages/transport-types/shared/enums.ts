/**
 * Agent Task Modes
 * Defines the operational mode of the agent
 */
export enum AgentTaskMode {
  /** Conversational interaction */
  CONVERSE = 'converse',

  /** Planning phase */
  PLAN = 'plan',

  /** Building/execution phase */
  BUILD = 'build',

  /** Human-in-the-Loop operations */
  HITL = 'hitl',

  /** Dashboard data access operations */
  DASHBOARD = 'dashboard',
}

/**
 * JSON-RPC Method Names
 * Maps to AgentTaskMode internally
 */
export type JsonRpcMethod =
  | 'converse'
  | 'agent.converse'
  | 'tasks.converse'
  | 'plan'
  | 'agent.plan'
  | 'tasks.plan'
  | 'build'
  | 'agent.build'
  | 'tasks.build'
  | 'hitl'
  | 'hitl.resume'
  | 'hitl.status'
  | 'hitl.history'
  | 'dashboard'
  | 'agent.dashboard'
  | 'tasks.dashboard'
  | string; // Allow extension

/**
 * Standard JSON-RPC 2.0 Error Codes
 */
export enum JsonRpcErrorCode {
  /** Invalid JSON was received by the server */
  PARSE_ERROR = -32700,

  /** The JSON sent is not a valid Request object */
  INVALID_REQUEST = -32600,

  /** The method does not exist / is not available */
  METHOD_NOT_FOUND = -32601,

  /** Invalid method parameter(s) */
  INVALID_PARAMS = -32602,

  /** Internal JSON-RPC error */
  INTERNAL_ERROR = -32603,

  /** Reserved for implementation-defined server-errors (-32000 to -32099) */
  SERVER_ERROR_START = -32099,
  SERVER_ERROR_END = -32000,
}

/**
 * Custom A2A Error Codes (extend JSON-RPC reserved range)
 */
export enum A2AErrorCode {
  /** Unauthorized access */
  UNAUTHORIZED = -32001,

  /** Forbidden access */
  FORBIDDEN = -32003,

  /** Resource not found */
  NOT_FOUND = -32004,

  /** Resource conflict */
  CONFLICT = -32009,

  /** Rate limit exceeded */
  RATE_LIMITED = -32042,
}
