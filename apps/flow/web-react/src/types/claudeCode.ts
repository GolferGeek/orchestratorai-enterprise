/**
 * Claude Code Panel Types
 *
 * Type definitions for the Claude Code panel integration.
 */

export interface OutputEntry {
  type: 'user' | 'assistant' | 'system' | 'error' | 'info' | 'tool' | 'event';
  content: string;
  timestamp: Date;
  // Optional metadata for tool calls and events
  metadata?: {
    eventType?: string;
    toolName?: string;
    toolId?: string;
    verb?: string;
  };
}

export interface ClaudeCommand {
  name: string;
  description: string;
}

export interface ClaudeSkill {
  name: string;
  description: string;
}

export interface ClaudeHealthResponse {
  status: string;
  sdkAvailable: boolean;
  nodeEnv: string;
}

export interface ClaudeMessage {
  type:
    | 'system'
    | 'assistant'
    | 'user'
    | 'result'
    | 'stream_event'
    | 'error'
    | 'session'
    | 'tool_progress';
  message?: {
    content: string | ContentBlock[];
  };
  result?: unknown;
  total_cost_usd?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  error?: string;
  sessionId?: string;
  // Tool progress fields (from SDK tool_progress events)
  tool_use_id?: string;
  tool_name?: string;
  elapsed_time_seconds?: number;
  parent_tool_use_id?: string | null;
  // Stream event fields (for parsing tool_use blocks)
  event?: RawMessageStreamEvent;
}

export interface ContentBlock {
  type: string;
  text?: string;
  // Tool use block fields
  id?: string;
  name?: string;
  input?: unknown;
}

/**
 * Raw message stream event from Claude API
 * Simplified type - actual SDK type is more complex
 */
export interface RawMessageStreamEvent {
  type: string;
  index?: number;
  content_block?: ContentBlock;
  delta?: {
    type: string;
    text?: string;
    partial_json?: string;
  };
}

/**
 * Active tool execution tracking
 */
export interface ActiveTool {
  id: string;
  name: string;
  startTime: number;
  elapsedSeconds: number;
  status: 'running' | 'completed' | 'error';
}

/**
 * Fun verbs for tool progress display (like Claude Code CLI)
 */
export const TOOL_VERBS: Record<string, string[]> = {
  Read: ['Reading', 'Scanning', 'Examining', 'Perusing', 'Inspecting'],
  Write: ['Writing', 'Crafting', 'Composing', 'Creating', 'Generating'],
  Edit: ['Editing', 'Modifying', 'Tweaking', 'Refining', 'Adjusting'],
  Bash: ['Executing', 'Running', 'Processing', 'Computing', 'Operating'],
  Glob: ['Searching', 'Finding', 'Locating', 'Discovering', 'Scanning'],
  Grep: ['Searching', 'Hunting', 'Scanning', 'Probing', 'Investigating'],
  Task: ['Delegating', 'Spawning', 'Launching', 'Dispatching', 'Orchestrating'],
  WebFetch: ['Fetching', 'Retrieving', 'Downloading', 'Pulling', 'Grabbing'],
  WebSearch: ['Searching', 'Querying', 'Exploring', 'Investigating', 'Researching'],
  TodoWrite: ['Planning', 'Organizing', 'Tracking', 'Managing', 'Scheduling'],
  default: ['Processing', 'Working', 'Thinking', 'Computing', 'Analyzing'],
};

/**
 * Get a random verb for a tool
 */
export function getToolVerb(toolName: string): string {
  const verbs = TOOL_VERBS[toolName] || TOOL_VERBS.default;
  return verbs[Math.floor(Math.random() * verbs.length)];
}

export interface StoredStats {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface ClaudeCodePanelState {
  isServerAvailable: boolean;
  isCheckingServer: boolean;
  isExecuting: boolean;
  prompt: string;
  output: OutputEntry[];
  currentAssistantMessage: string;
  commands: ClaudeCommand[];
  skills: ClaudeSkill[];
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  sessionId: string | undefined;
  commandHistory: string[];
  historyIndex: number;
  pinnedCommands: string[];
}
