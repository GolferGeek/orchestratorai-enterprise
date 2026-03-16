/**
 * Transport Types
 *
 * Shared TypeScript types for agent-to-agent communication
 * Used by both frontend (web) and backend (api) for type-safe API contracts
 */

// ============================================================================
// DATABASE ABSTRACTION
// ============================================================================
export {
  DATABASE_SERVICE,
  type QueryResult,
  type QueryBuilder,
  type DatabaseService,
} from './database';

// ============================================================================
// CORE - EXECUTION CONTEXT
// ============================================================================
export type { ExecutionContext } from './core/execution-context';
export {
  NIL_UUID,
  isNilUuid,
  createExecutionContext,
  createMockExecutionContext,
  isExecutionContext,
} from './core/execution-context';

// ============================================================================
// SHARED ENUMS
// ============================================================================
export {
  AgentTaskMode,
  JsonRpcErrorCode,
  A2AErrorCode,
} from './shared/enums';
export type { JsonRpcMethod } from './shared/enums';

// ============================================================================
// SHARED DATA TYPES
// ============================================================================
export type {
  PlanData,
  PlanVersionData,
  DeliverableData,
  DeliverableVersionData,
} from './shared/data-types';
export type {
  JsonPrimitive,
  JsonValue,
  JsonArray,
  JsonObject,
} from './shared/json.types';

// ============================================================================
// JSON-RPC 2.0 BASE TYPES
// ============================================================================
export type {
  JsonRpcRequest,
  JsonRpcSuccessResponse,
  JsonRpcErrorResponse,
  JsonRpcResponse,
  JsonRpcError,
} from './request/json-rpc.types';

// ============================================================================
// REQUEST TYPES
// ============================================================================
export type {
  TaskMessage,
  TaskRequestParams,
  A2ATaskRequest,
} from './request/task-request.types';

// ============================================================================
// RESPONSE TYPES
// ============================================================================
export type {
  TaskResponsePayload,
  TaskResponse,
  A2ATaskSuccessResponse,
  A2ATaskErrorResponse,
  A2ATaskResponse,
} from './response/task-response.types';

// ============================================================================
// MODE-SPECIFIC TYPES
// ============================================================================

// Plan Mode
export type {
  PlanAction,
  PlanCreatePayload,
  PlanReadPayload,
  PlanListPayload,
  PlanEditPayload,
  PlanRerunPayload,
  PlanSetCurrentPayload,
  PlanDeleteVersionPayload,
  PlanMergeVersionsPayload,
  PlanCopyVersionPayload,
  PlanDeletePayload,
  PlanModePayload,
  PlanRequestMetadata,
  PlanResponseMetadata,
  PlanCreateResponseContent,
  PlanReadResponseContent,
  PlanListResponseContent,
  PlanRerunResponseContent,
} from './modes/plan.types';

// Build Mode
export type {
  BuildAction,
  BuildCreatePayload,
  BuildReadPayload,
  BuildListPayload,
  BuildEditPayload,
  BuildRerunPayload,
  BuildSetCurrentPayload,
  BuildDeleteVersionPayload,
  BuildMergeVersionsPayload,
  BuildCopyVersionPayload,
  BuildDeletePayload,
  BuildModePayload,
  BuildRequestMetadata,
  BuildResponseMetadata,
  BuildCreateResponseContent,
} from './modes/build.types';

// Converse Mode
export type {
  ConverseModePayload,
  ConverseRequestMetadata,
  ConverseResponseMetadata,
  ConverseResponseContent,
} from './modes/converse.types';

// HITL Mode
export type {
  HitlStatus,
  HitlDecision,
  HitlAction,
  HitlGeneratedContent,
  HitlContent,
  // Deliverable-based types (new)
  HitlDeliverableResponse,
  HitlResponse,
  HitlResumeRequest,
  HitlStatusResponse,
  HitlHistoryResponse,
  // Pending list types (new)
  HitlPendingItem,
  HitlPendingListResponse,
  // Payload types
  HitlResumePayload,
  HitlStatusPayload,
  HitlHistoryPayload,
  HitlPendingPayload,
  HitlModePayload,
  HitlRequestMetadata,
  HitlResponseMetadata,
  // LangGraph types (new)
  LangGraphInterruptValue,
  LangGraphInterruptItem,
  LangGraphInterruptResponse,
  // Legacy types (for backward compatibility)
  HitlStatusResponsePayload,
  HitlResumeResponseContent,
  HitlStatusResponseContent,
  HitlHistoryEntry,
  HitlHistoryResponseContent,
} from './modes/hitl.types';

export { isLangGraphInterruptResponse } from './modes/hitl.types';

// Dashboard Mode
export type {
  DashboardAction,
  DashboardRequestPayload,
  DashboardResponsePayload,
  DashboardModePayload,
  DashboardRequestMetadata,
  DashboardResponseMetadata,
  // Universe
  UniverseListParams,
  UniverseGetParams,
  UniverseCreateParams,
  UniverseUpdateParams,
  UniverseDeleteParams,
  // Target
  TargetListParams,
  TargetGetParams,
  TargetCreateParams,
  TargetUpdateParams,
  TargetDeleteParams,
  // Prediction
  PredictionListParams,
  PredictionGetParams,
  PredictionGetSnapshotParams,
  // Source
  SourceListParams,
  SourceGetParams,
  SourceCreateParams,
  SourceUpdateParams,
  SourceDeleteParams,
  SourceTestCrawlParams,
  // Analyst
  AnalystListParams,
  AnalystGetParams,
  AnalystCreateParams,
  AnalystUpdateParams,
  AnalystDeleteParams,
  // Learning
  LearningListParams,
  LearningGetParams,
  LearningCreateParams,
  LearningUpdateParams,
  LearningDeleteParams,
  // Learning Queue
  LearningQueueListParams,
  LearningQueueGetParams,
  LearningQueueRespondParams,
  // Review Queue
  ReviewQueueListParams,
  ReviewQueueGetParams,
  ReviewQueueRespondParams,
  // Strategy
  StrategyListParams,
  StrategyGetParams,
  // Missed Opportunity
  MissedOpportunityListParams,
  MissedOpportunityGetParams,
  // Tool Request
  ToolRequestListParams,
  ToolRequestCreateParams,
  ToolRequestUpdateStatusParams,
} from './modes/dashboard.types';

// Prediction Dashboard Entity Types
export type {
  // Universe
  PredictionUniverse,
  // Target
  PredictionTarget,
  // Instrument Price
  PriceHistoryPeriod,
  InstrumentPrice,
  PriceHistoryData,
  // Daily Report
  DailyReportSummary,
  DailyReportRun,
  DailyReportRecommendation,
  // Prediction
  TierResult,
  Prediction,
  PredictionSnapshot,
  PredictionDeepDive,
  // Source
  PredictionSource,
  TestCrawlResult,
  // Strategy
  PredictionStrategy,
  // Analyst
  PredictionAnalyst,
  // Learning
  PredictionLearning,
  LearningQueueItem,
  // Review Queue
  ReviewQueueItem,
  // Agent Activity
  AgentModificationType,
  AgentActivityItem,
  // Learning Session
  ExchangeOutcome,
  ExchangeInitiator,
  LearningExchange,
  ForkComparisonReport,
  LearningSessionResponse,
  AnalystContextVersion,
  // Missed Opportunity
  MissedOpportunity,
  MissedOpportunityAnalysis,
  // Tool Request
  ToolRequest,
  // LLM Cost
  LLMCostSummary,
  LLMCostSummaryParams,
  // Test Scenario
  TestScenarioStatus,
  InjectionPoint,
  TestScenarioConfig,
  TestScenarioResults,
  TestScenario,
  TestScenarioSummary,
  TestScenarioListParams,
  TestScenarioCreateParams,
  TestScenarioUpdateParams,
  TestScenarioInjectParams,
  TestScenarioGenerateParams,
  TestScenarioRunTierParams,
  TestScenarioCleanupParams,
  TierRunResult,
  CleanupResult,
  InjectResult,
  GenerateResult,
  TestScenarioExport,
  // Replay Tests
  ReplayTestStatus,
  RollbackDepth,
  ReplayTestResults,
  ReplayTest,
  ReplayTestSummary,
  ReplayAffectedRecords,
  ReplayTestResult,
  ReplayTestCreateParams,
  ReplayTestPreviewParams,
  ReplayTestPreviewResult,
  // Test Articles
  TestArticle,
  TestArticleListParams,
  TestArticleCreateParams,
  TestArticleUpdateParams,
  TestArticleBulkCreateParams,
  GenerateTestArticleParams,
  // Test Price Data
  TestPriceData,
  TestPriceDataListParams,
  TestPriceDataCreateParams,
  TestPriceDataUpdateParams,
  TestPriceDataBulkCreateParams,
  // Test Target Mirror
  TestTargetMirror,
  TestTargetMirrorWithTarget,
  TestTargetMirrorListParams,
  TestTargetMirrorCreateParams,
  TestTargetMirrorEnsureParams,
} from './modes/prediction-dashboard.types';

// ============================================================================
// STREAMING (SSE) TYPES
// ============================================================================
export type {
  BaseSSEEvent,
  AgentStreamContext,
  AgentStreamChunkMetadata,
  AgentStreamChunkData,
  AgentStreamCompleteData,
  AgentStreamErrorData,
  AgentStreamChunkSSEEvent,
  AgentStreamCompleteSSEEvent,
  AgentStreamErrorSSEEvent,
  TaskProgressData,
  TaskProgressSSEEvent,
  SSEEvent,
  SSEEventHandler,
  SSEConnectionOptions,
  SSEConnectionState,
} from './streaming/sse-events.types';

// ============================================================================
// STRICT TYPE ALIASES (for web compatibility)
// ============================================================================
export * from './shared/strict-aliases';

// ============================================================================
// TYPE GUARDS
// ============================================================================

import type {
  JsonRpcRequest,
  JsonRpcSuccessResponse,
  JsonRpcErrorResponse,
} from './request/json-rpc.types';
import type { A2ATaskRequest } from './request/task-request.types';
import type { TaskResponse } from './response/task-response.types';

export function isJsonRpcRequest(obj: any): obj is JsonRpcRequest {
  return (
    obj &&
    typeof obj === 'object' &&
    obj.jsonrpc === '2.0' &&
    typeof obj.method === 'string' &&
    ('id' in obj)
  );
}

export function isJsonRpcSuccessResponse(obj: any): obj is JsonRpcSuccessResponse {
  return (
    obj &&
    typeof obj === 'object' &&
    obj.jsonrpc === '2.0' &&
    'result' in obj &&
    ('id' in obj)
  );
}

export function isJsonRpcErrorResponse(obj: any): obj is JsonRpcErrorResponse {
  return (
    obj &&
    typeof obj === 'object' &&
    obj.jsonrpc === '2.0' &&
    'error' in obj &&
    ('id' in obj)
  );
}

export function isA2ATaskRequest(obj: any): obj is A2ATaskRequest {
  return (
    isJsonRpcRequest(obj) &&
    obj.params &&
    typeof obj.params === 'object'
  );
}

export function isTaskResponse(obj: any): obj is TaskResponse {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.success === 'boolean' &&
    typeof obj.mode === 'string'
  );
}
