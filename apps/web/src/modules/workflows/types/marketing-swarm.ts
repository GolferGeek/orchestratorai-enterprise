/**
 * Marketing Swarm Types
 *
 * Types for the multi-agent marketing content generation system
 */

// =============================================================================
// Agent Configuration Types
// =============================================================================

export interface AgentConfig {
  agentSlug: string;
  llmConfigId: string;
  llmProvider: string;
  llmModel: string;
  displayName?: string;
}

export interface ExecutionConfig {
  maxLocalConcurrent: number;
  maxCloudConcurrent: number;
  maxEditCycles: number;
  topNForFinalRanking: number;
  topNForDeliverable?: number;
}

export interface SwarmConfig {
  writers: AgentConfig[];
  editors: AgentConfig[];
  evaluators: AgentConfig[];
  maxEditCycles: number;
  execution?: ExecutionConfig; // Optional for backward compatibility, but should be provided
}

// =============================================================================
// Content Types
// =============================================================================

export interface MarketingContentType {
  id: string;
  slug: string;
  name: string;
  description?: string;
  systemPromptTemplate?: string;
  requiredFields?: string[];
  isActive: boolean;
}

// =============================================================================
// Agent Definitions (from database)
// =============================================================================

export type MarketingAgentRole = 'writer' | 'editor' | 'evaluator';

export interface AgentPersonality {
  system_context: string;
  style_guidelines?: string[];
  strengths?: string[];
  weaknesses?: string[];
  review_focus?: string[];
  approval_criteria?: string;
  feedback_style?: string;
  evaluation_criteria?: Record<string, string>;
  scoring_approach?: string;
  score_anchors?: Record<string, string>;
}

export interface MarketingAgent {
  id: string;
  slug: string;
  name: string;
  role: MarketingAgentRole;
  description?: string;
  systemPrompt?: string;
  isActive: boolean;
}

// Swarm configuration response from API
// Note: LLM models are fetched separately from /llm/models endpoint
// Frontend now sends llmProvider/llmModel directly in config
export interface SwarmConfigurationResponse {
  contentTypes: MarketingContentType[];
  writers: MarketingAgent[];
  editors: MarketingAgent[];
  evaluators: MarketingAgent[];
}

// =============================================================================
// Prompt Data (8-question interview)
// =============================================================================

export interface PromptData {
  topic: string;
  audience: string;
  goal: string;
  keyPoints: string[];
  tone: string;
  constraints?: string;
  examples?: string;
  additionalContext?: string;
}

// =============================================================================
// Execution Queue
// =============================================================================

export type QueueItemStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';

export interface QueueItem {
  id: string;
  stepType: 'write' | 'edit' | 'evaluate';
  sequence: number;
  agentSlug: string;
  llmConfigId: string;
  provider: string;
  dependsOn: string[];
  inputOutputId?: string;
  status: QueueItemStatus;
  resultId?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

// =============================================================================
// Outputs and Evaluations
// =============================================================================

export type OutputStatus = 'draft' | 'editing' | 'approved' | 'final';

export interface SwarmOutput {
  id: string;
  taskId: string;
  writerAgentSlug: string;
  writerLlmConfigId: string;
  editorAgentSlug?: string;
  editorLlmConfigId?: string;
  content: string;
  editCycle: number;
  status: OutputStatus;
  editorFeedback?: string;
  editorApproved?: boolean;
  llmMetadata?: {
    tokensUsed?: number;
    latencyMs?: number;
    cost?: number;
  };
  createdAt: string;
}

export interface SwarmEvaluation {
  id: string;
  taskId: string;
  outputId: string;
  evaluatorAgentSlug: string;
  evaluatorLlmConfigId: string;
  score: number;
  reasoning: string;
  criteriaScores?: Record<string, number>;
  llmMetadata?: {
    tokensUsed?: number;
    latencyMs?: number;
    cost?: number;
  };
  createdAt: string;
}

// =============================================================================
// Swarm Task
// =============================================================================

export type SwarmTaskStatus = 'pending' | 'running' | 'completed' | 'failed';

// Phase 2: More granular phases for dual-track execution
export type SwarmPhase =
  | 'initializing'
  | 'building_queue'
  | 'writing'
  | 'editing'
  | 'evaluating_initial'
  | 'selecting_finalists'
  | 'evaluating_final'
  | 'ranking'
  | 'completed'
  | 'failed';

// Phase 2: Output status from database-driven state machine
export type OutputStatusPhase2 =
  | 'pending_write'
  | 'writing'
  | 'pending_edit'
  | 'editing'
  | 'pending_rewrite'
  | 'rewriting'
  | 'approved'
  | 'max_cycles_reached'
  | 'failed';

export interface SwarmTask {
  taskId: string;
  organizationSlug: string;
  userId: string;
  conversationId?: string;
  contentTypeSlug: string;
  promptData: PromptData;
  config: SwarmConfig;
  status: SwarmTaskStatus;
  progress: {
    total: number;
    completed: number;
    percentage: number;
  };
  phase?: SwarmPhase;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

// =============================================================================
// Ranked Results
// =============================================================================

export interface RankedResult {
  outputId: string;
  averageScore: number;
  weightedScore?: number;
  rank?: number;
}

// =============================================================================
// Phase 2: Enhanced Types for Dual-Track Execution
// =============================================================================

/**
 * Agent info as returned in SSE messages
 */
export interface SSEAgentInfo {
  slug: string;
  name?: string;
  llmProvider?: string;
  llmModel?: string;
  isLocal?: boolean;
}

/**
 * Output record as returned from dual-track processor SSE
 */
export interface SwarmOutputPhase2 {
  id: string;
  status: OutputStatusPhase2;
  writerAgent: SSEAgentInfo;
  editorAgent: SSEAgentInfo | null;
  content?: string;
  editCycle: number;
  editorFeedback?: string;
  initialAvgScore?: number;
  initialRank?: number;
  isFinalist?: boolean;
  finalTotalScore?: number;
  finalRank?: number;
  llmMetadata?: {
    // Accumulated totals (running total for this output)
    tokensUsed?: number;
    cost?: number;
    totalLatencyMs?: number;
    llmCallCount?: number;
    lastLatencyMs?: number;
    // Breakdown by type (for drill-down view)
    evaluationCost?: number;
    evaluationTokens?: number;
    // Legacy field for backward compatibility
    latencyMs?: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Evaluation record as returned from dual-track processor SSE
 */
export interface SwarmEvaluationPhase2 {
  id: string;
  outputId: string;
  stage: 'initial' | 'final';
  status: 'pending' | 'running' | 'completed' | 'failed';
  evaluatorAgent: SSEAgentInfo;
  score?: number;
  rank?: number;
  weightedScore?: number;
  reasoning?: string;
  llmMetadata?: {
    tokensUsed?: number;
    latencyMs?: number;
    cost?: number;
  };
}

/**
 * Ranking entry from SSE ranking_updated event
 */
export interface RankingEntry {
  outputId: string;
  rank: number;
  totalScore: number;
  avgScore?: number;
  writerAgentSlug: string;
  editorAgentSlug?: string;
}

/**
 * Finalist info from SSE finalists_selected event
 */
export interface FinalistInfo {
  id: string;
  rank: number;
  avgScore: number;
  writerAgentSlug: string;
  editorAgentSlug?: string;
}

// =============================================================================
// Request/Response DTOs
// =============================================================================

export interface CreateSwarmTaskRequest {
  contentTypeSlug: string;
  promptData: PromptData;
  config: SwarmConfig;
}

export interface SwarmTaskResponse {
  taskId: string;
  status: SwarmTaskStatus;
  phase?: SwarmPhase;
  outputs: SwarmOutput[];
  evaluations: SwarmEvaluation[];
  rankedResults: RankedResult[];
  error?: string;
  duration?: number;
}

export interface SwarmStatusResponse {
  taskId: string;
  phase: SwarmPhase;
  progress: {
    total: number;
    completed: number;
    percentage: number;
  };
  error?: string;
}

export interface SwarmStateResponse {
  taskId: string;
  phase: SwarmPhase;
  contentTypeSlug: string;
  promptData: PromptData;
  config: SwarmConfig;
  executionQueue: QueueItem[];
  outputs: SwarmOutput[];
  evaluations: SwarmEvaluation[];
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

// =============================================================================
// SSE Message Types (Phase 2: Fat Messages from Observability Stream)
// =============================================================================

/**
 * Phase 2 SSE message types from dual-track processor
 * These are "fat messages" containing full data, no lookups needed
 */
export type SSEMessageTypePhase2 =
  | 'phase_changed'
  | 'queue_built'
  | 'output_updated'
  | 'evaluation_updated'
  | 'finalists_selected'
  | 'ranking_updated';

/**
 * Base observability event structure from backend
 */
export interface ObservabilityEvent {
  hook_event_type: string;
  context: {
    taskId?: string;
    conversationId?: string;
    userId?: string;
    agentSlug?: string;
  };
  message?: string;
  metadata?: Record<string, unknown>; // Legacy - may not be present
  payload?: {
    data?: {
      metadata?: Record<string, unknown>; // Marketing Swarm metadata from LangGraph
    };
    metadata?: Record<string, unknown>; // Direct metadata (alternative location)
    [key: string]: unknown;
  };
}

/**
 * Phase changed event metadata
 */
export interface PhaseChangedMetadata {
  type: 'phase_changed';
  phase: SwarmPhase;
}

/**
 * Queue built event metadata - lists all output combinations
 */
export interface QueueBuiltMetadata {
  type: 'queue_built';
  taskId: string;
  totalOutputs: number;
  writers: number;
  editors: number;
  evaluators: number;
  outputs: {
    id: string;
    status: string;
    writerAgentSlug: string;
    editorAgentSlug?: string;
  }[];
}

/**
 * Output updated event metadata - contains full output data
 */
export interface OutputUpdatedMetadata {
  type: 'output_updated';
  taskId: string;
  output: SwarmOutputPhase2;
}

/**
 * Evaluation updated event metadata - contains full evaluation data
 */
export interface EvaluationUpdatedMetadata {
  type: 'evaluation_updated';
  taskId: string;
  evaluation: SwarmEvaluationPhase2;
}

/**
 * Finalists selected event metadata
 */
export interface FinalistsSelectedMetadata {
  type: 'finalists_selected';
  taskId: string;
  count: number;
  finalists: FinalistInfo[];
}

/**
 * Ranking updated event metadata
 */
export interface RankingUpdatedMetadata {
  type: 'ranking_updated';
  taskId: string;
  stage: 'initial' | 'final';
  rankings: RankingEntry[];
}

/**
 * Union type for all Phase 2 SSE metadata payloads
 */
export type SSEMetadataPhase2 =
  | PhaseChangedMetadata
  | QueueBuiltMetadata
  | OutputUpdatedMetadata
  | EvaluationUpdatedMetadata
  | FinalistsSelectedMetadata
  | RankingUpdatedMetadata;

// =============================================================================
// Legacy SSE Types (for backward compatibility)
// =============================================================================

export type SSEMessageType =
  | 'queue_built'
  | 'step_started'
  | 'step_completed'
  | 'edit_cycle_added'
  | 'phase_changed'
  | 'error';

export interface SSEQueueBuiltMessage {
  type: 'queue_built';
  taskId: string;
  totalSteps: number;
  writers: { slug: string; llmConfig: string }[];
  editors: { slug: string; llmConfig: string }[];
  evaluators: { slug: string; llmConfig: string }[];
}

export interface SSEStepStartedMessage {
  type: 'step_started';
  taskId: string;
  stepId: string;
  stepType: 'write' | 'edit' | 'evaluate';
  sequence: number;
  agent: {
    slug: string;
    name: string;
    role: MarketingAgentRole;
  };
  llmConfig: {
    provider: string;
    model: string;
    displayName: string;
  };
  editCycle?: number;
  inputOutputId?: string;
}

export interface SSEStepCompletedMessage {
  type: 'step_completed';
  taskId: string;
  stepId: string;
  stepType: 'write' | 'edit' | 'evaluate';
  agent: { slug: string; name: string };
  llmConfig: { provider: string; model: string };
  result: {
    outputId: string;
    content?: string;
    feedback?: string;
    approved?: boolean;
    score?: number;
    reasoning?: string;
  };
  metadata: {
    tokensUsed: number;
    latencyMs: number;
  };
}

export interface SSEPhaseChangedMessage {
  type: 'phase_changed';
  taskId: string;
  phase: SwarmPhase;
  progress: {
    completedSteps: number;
    totalSteps: number;
    percentage: number;
  };
}

export interface SSEErrorMessage {
  type: 'error';
  taskId: string;
  stepId?: string;
  message: string;
  recoverable: boolean;
}

export type SSEMessage =
  | SSEQueueBuiltMessage
  | SSEStepStartedMessage
  | SSEStepCompletedMessage
  | SSEPhaseChangedMessage
  | SSEErrorMessage;

// =============================================================================
// UI State Types
// =============================================================================

export interface MarketingSwarmUIState {
  currentView: 'config' | 'progress' | 'results';
  selectedOutputId?: string;
  compareOutputIds?: string[];
  showDetailedEvaluations: boolean;
}

export interface AgentCardState {
  agentSlug: string;
  llmConfigId: string;
  status: 'idle' | 'processing' | 'completed' | 'failed';
  outputId?: string;
  score?: number;
}

// =============================================================================
// Output Version Types (for edit history modal)
// =============================================================================

/**
 * Single version of an output (from write or rewrite)
 */
export interface OutputVersion {
  id: string;
  output_id: string;
  task_id: string;
  version_number: number;
  content: string;
  action_type: 'write' | 'rewrite';
  editor_feedback: string | null;
  llm_metadata: {
    tokensUsed?: number;
    latencyMs?: number;
  } | null;
  created_at: string;
}

/**
 * Response from getOutputVersions API
 */
export interface OutputVersionsResponse {
  outputId: string;
  versions: OutputVersion[];
}
