/**
 * MCP 2025-03-26 Specification Interfaces
 *
 * TypeScript interfaces for Model Context Protocol
 * Based on the official MCP specification
 */

export interface MCPServerInfo {
  protocolVersion: string;
  serverInfo: {
    name: string;
    version: string;
    description?: string;
  };
  capabilities: MCPServerCapabilities;
  instructions?: string;
}

export interface MCPServerCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  logging?: Record<string, unknown>;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export interface MCPToolRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface MCPToolResponse {
  content: MCPContent[];
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

export interface MCPContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
  annotation?: MCPAnnotation;
}

export interface MCPAnnotation {
  audience?: 'user' | 'assistant';
  priority?: 'low' | 'normal' | 'high';
}

// JSON-RPC 2.0 base interfaces
export interface MCPJsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPJsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: MCPJsonRpcError;
}

export interface MCPJsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// MCP-specific method parameter interfaces
export interface MCPInitializeParams {
  protocolVersion: string;
  clientInfo: {
    name: string;
    version: string;
  };
  capabilities: MCPClientCapabilities;
}

export interface MCPClientCapabilities {
  experimental?: Record<string, unknown>;
  sampling?: Record<string, unknown>;
}

export interface MCPListToolsResult {
  tools: MCPToolDefinition[];
}

export interface MCPCallToolParams {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface MCPPingResult {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  namespaces?: Record<string, boolean>;
}

// Tool handler interface for namespace implementations
export interface IMCPToolHandler {
  /**
   * Get all tools available in this namespace
   */
  getTools(): Promise<MCPToolDefinition[]>;

  /**
   * Execute a specific tool
   */
  executeTool(request: MCPToolRequest): Promise<MCPToolResponse>;

  /**
   * Health check for this tool handler
   */
  ping?(): Promise<boolean>;
}

// Error codes following JSON-RPC 2.0 and MCP specifications
export enum MCPErrorCode {
  // JSON-RPC 2.0 standard errors
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,

  // MCP-specific errors (reserved range -32099 to -32000)
  TOOL_NOT_FOUND = -32000,
  TOOL_EXECUTION_ERROR = -32001,
  NAMESPACE_NOT_FOUND = -32002,
  PROTOCOL_ERROR = -32003,
  AUTHENTICATION_ERROR = -32004,
  PERMISSION_ERROR = -32005,
}

// Client Interface (MCP 2025-03-26 specification)
export interface IMCPClient {
  /**
   * Initialize MCP connection
   */
  initialize(clientInfo?: {
    name: string;
    version: string;
  }): Promise<MCPServerInfo>;

  /**
   * Get server information (legacy compatibility)
   */
  getServerInfo(): Promise<MCPServerInfo>;

  /**
   * List available tools
   */
  listTools(): Promise<MCPToolDefinition[]>;

  /**
   * Call a specific tool
   */
  callTool(request: MCPToolRequest): Promise<MCPToolResponse>;

  /**
   * Check if server is healthy
   */
  ping(): Promise<boolean>;

  /**
   * Get detailed ping information
   */
  getPingDetails?(): Promise<MCPPingResult>;
}

// Configuration Types
export interface MCPClientConfig {
  serverUrl: string;
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
}

export interface MCPServerConfig {
  port: number;
  host?: string;
  cors?: boolean;
  timeout?: number;
}

// MCP Server interface
export interface IMCPServer {
  initialize(): Promise<void>;
  getServerInfo(): Promise<MCPServerInfo>;
  listTools(): Promise<MCPToolDefinition[]>;
  callTool(request: MCPToolRequest): Promise<MCPToolResponse>;
  ping?(): Promise<boolean>;
}

// Supabase-specific request interfaces
export interface SupabaseSchemaRequest {
  tables?: string[];
  domain?: 'core' | 'kpi';
}

export interface SupabaseSQLRequest {
  query: string;
  tables: string[];
  domain_hint?: string;
  max_rows?: number;
  // ExecutionContext contains provider, model, userId, conversationId, etc.
  executionContext?: unknown; // Using unknown to avoid circular dependency
}

export interface SupabaseExecuteRequest {
  sql: string;
  max_rows?: number;
}

export interface SupabaseAnalyzeRequest {
  data: Array<Record<string, unknown>>;
  analysis_prompt: string;
  // ExecutionContext contains provider, model, userId, conversationId, etc.
  executionContext?: unknown; // Using unknown to avoid circular dependency
}
