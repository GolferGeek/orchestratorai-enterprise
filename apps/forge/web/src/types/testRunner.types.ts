/**
 * Admin Agent Test Runner types
 * Used by useAgentTestRunner composable and AgentTestRunnerPage
 */

export interface ProviderPlanes {
  DB_PROVIDER: string;
  STORAGE_PROVIDER: string;
  AUTH_PROVIDER: string;
  CONFIG_PROVIDER: string;
  WORK_PROVIDER: string;
  RAG_PROVIDER: string;
  LLM_PROVIDER: string;
  KNOWLEDGE_PROVIDER: string;
  // Present when LLM_PROVIDER=simplified
  COMMERCIAL_LLM_PROVIDER?: string;
  OPENSOURCE_LLM_PROVIDER?: string;
  OLLAMA_CLOUD_BASE_URL?: string;
}

export type TestStatus =
  | "idle"
  | "creating-conversation"
  | "connecting-stream"
  | "running"
  | "streaming"
  | "pass"
  | "fail"
  | "error";

/** Per-agent test configuration stored in agent metadata.test_config JSONB */
export interface AgentTestConfig {
  prompt?: string;
  mode?: "converse" | "build";
  provider?: string;
  model?: string;
  payload?: Record<string, unknown>;
  timeout?: number;
  disabled?: boolean;
}

export interface AgentTestDef {
  slug: string;
  type: string;
  org: string;
  mode: "converse" | "build";
  async: boolean;
  prompt: string;
  displayName: string;
  payload?: Record<string, unknown>;
  timeout: number;
  provider?: string;
  model?: string;
  hasCustomConfig: boolean;
  configSource: "custom" | "builtin" | "auto";
}

export interface TestPreset {
  name: string;
  slugs: string[];
}

export interface AgentTestResult {
  agentSlug: string;
  status: TestStatus;
  startTime: number | null;
  endTime: number | null;
  durationMs: number | null;
  httpStatus: number | null;
  modelUsed: string | null;
  providerUsed: string | null;
  responsePreview: string | null;
  conversationId: string | null;
  deliverableId: string | null;
  taskId: string | null;
  error: string | null;
  streamEvents: string[];
}
