/**
 * Prediction Agent Types
 *
 * Frontend type definitions for the Prediction Agent (predictor) capability.
 * These types correspond to the prediction schema entities and dashboard operations.
 *
 * Previously imported from @orchestrator-ai/transport-types but are product-specific
 * to Forge's predictor capability.
 */

// ============================================================================
// ENTITY TYPES
// ============================================================================

export type PredictionDomain = 'stocks' | 'crypto' | 'elections' | 'polymarket';

export interface PredictionLlmConfig {
  provider?: string;
  model?: string;
  tiers?: {
    gold?: { provider: string; model: string };
    silver?: { provider: string; model: string };
    bronze?: { provider: string; model: string };
  };
}

export interface PredictionUniverse {
  id: string;
  name: string;
  domain: PredictionDomain;
  description?: string;
  organizationSlug: string;
  agentSlug: string;
  strategyId?: string;
  llmConfig?: PredictionLlmConfig;
  createdAt: string;
  updatedAt: string;
}

export interface PredictionTarget {
  id: string;
  universeId: string;
  name: string;
  symbol: string;
  targetType: string;
  context?: string;
  llmConfigOverride?: Record<string, unknown>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PriceHistoryPeriod {
  period: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface InstrumentPrice {
  symbol: string;
  price: number;
  change?: number;
  changePercent?: number;
  timestamp: string;
}

export interface PriceHistoryData {
  symbol: string;
  periods: PriceHistoryPeriod[];
}

export interface DailyReportSummary {
  id: string;
  date: string;
  universeId: string;
  summary: string;
  keyInsights: string[];
  createdAt: string;
}

export interface DailyReportRun {
  id: string;
  reportId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
}

export interface DailyReportRecommendation {
  symbol: string;
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  rationale: string;
}

export interface TierResult {
  tier: 'gold' | 'silver' | 'bronze';
  prediction?: string;
  confidence?: number;
  rationale?: string;
  error?: string;
}

export interface Prediction {
  id: string;
  targetId: string;
  universeId: string;
  organizationSlug: string;
  agentSlug: string;
  direction: string;
  confidence: number;
  rationale: string;
  horizon?: string;
  status: string;
  outcome?: string;
  accuracy?: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface PredictionSnapshot {
  id: string;
  predictionId: string;
  snapshotType: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface PredictionDeepDive {
  predictionId: string;
  analysis: string;
  factors: string[];
  risks: string[];
  opportunities: string[];
}

export interface PredictionSource {
  id: string;
  name: string;
  sourceType: 'web' | 'rss' | 'twitter_search' | 'api';
  scopeLevel: 'runner' | 'domain' | 'universe' | 'target';
  domain?: string;
  universeId?: string;
  targetId?: string;
  crawlConfig: Record<string, unknown>;
  authConfig?: Record<string, unknown>;
  active: boolean;
  lastCrawledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestCrawlResult {
  success: boolean;
  articles: number;
  errors: string[];
  sampleHeadlines: string[];
}

export interface PredictionStrategy {
  id: string;
  name: string;
  description?: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PredictionAnalyst {
  id: string;
  slug: string;
  name: string;
  perspective: string;
  scopeLevel: 'runner' | 'domain' | 'universe' | 'target';
  domain?: string;
  universeId?: string;
  targetId?: string;
  defaultWeight: number;
  tierInstructions?: {
    gold?: string;
    silver?: string;
    bronze?: string;
  };
  learnedPatterns?: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PredictionLearning {
  id: string;
  title: string;
  description: string;
  learningType: string;
  scopeLevel: string;
  domain?: string;
  status: string;
  isTest: boolean;
  timesApplied: number;
  timesHelpful: number;
  createdAt: string;
  updatedAt: string;
}

export interface LearningQueueItem {
  id: string;
  learningId: string;
  predictionId: string;
  status: string;
  createdAt: string;
}

export interface ReviewQueueItem {
  id: string;
  predictionId: string;
  reviewType: string;
  status: string;
  notes?: string;
  createdAt: string;
}

export type AgentModificationType = 'learning' | 'pattern' | 'weight' | 'instruction';

export interface AgentActivityItem {
  id: string;
  activityType: AgentModificationType;
  description: string;
  impact: string;
  timestamp: string;
}

export type ExchangeOutcome = 'positive' | 'negative' | 'neutral';
export type ExchangeInitiator = 'agent' | 'human';

export interface LearningExchange {
  id: string;
  sessionId: string;
  initiator: ExchangeInitiator;
  message: string;
  outcome?: ExchangeOutcome;
  timestamp: string;
}

export interface ForkComparisonReport {
  baselineAccuracy: number;
  forkAccuracy: number;
  improvement: number;
  sampleSize: number;
}

export interface LearningSessionResponse {
  sessionId: string;
  exchanges: LearningExchange[];
  summary?: string;
  completedAt?: string;
}

export interface AnalystContextVersion {
  id: string;
  analystId: string;
  version: number;
  context: string;
  createdAt: string;
}

export interface MissedOpportunity {
  id: string;
  targetId: string;
  direction: string;
  confidence: number;
  missedAt: string;
  analysis?: string;
}

export interface MissedOpportunityAnalysis {
  opportunities: MissedOpportunity[];
  patterns: string[];
  recommendations: string[];
}

export interface ToolRequest {
  id: string;
  toolName: string;
  params: Record<string, unknown>;
  status: string;
  result?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface LLMCostSummary {
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
  period: string;
}

// ============================================================================
// PARAM TYPES
// ============================================================================

export interface UniverseListParams {
  page?: number;
  limit?: number;
  domain?: PredictionDomain;
}

export interface UniverseGetParams {
  universeId: string;
}

export interface UniverseCreateParams {
  name: string;
  domain: PredictionDomain;
  description?: string;
  strategyId?: string;
  llmConfig?: PredictionLlmConfig;
}

export interface UniverseUpdateParams {
  universeId: string;
  name?: string;
  description?: string;
  llmConfig?: PredictionLlmConfig;
}

export interface UniverseDeleteParams {
  universeId: string;
}

export interface TargetListParams {
  universeId?: string;
  page?: number;
  limit?: number;
}

export interface TargetGetParams {
  targetId: string;
}

export interface TargetCreateParams {
  universeId: string;
  name: string;
  symbol: string;
  targetType: string;
  context?: string;
}

export interface TargetUpdateParams {
  targetId: string;
  name?: string;
  context?: string;
}

export interface TargetDeleteParams {
  targetId: string;
}

export interface PredictionListParams {
  targetId?: string;
  universeId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface PredictionGetParams {
  predictionId: string;
}

export interface PredictionGetSnapshotParams {
  predictionId: string;
  snapshotType?: string;
}

export interface SourceListParams {
  universeId?: string;
  targetId?: string;
  scopeLevel?: string;
}

export interface SourceGetParams {
  sourceId: string;
}

export interface SourceCreateParams {
  name: string;
  sourceType: string;
  url: string;
  scopeLevel: string;
  universeId?: string;
  targetId?: string;
  crawlConfig?: Record<string, unknown>;
}

export interface SourceUpdateParams {
  sourceId: string;
  name?: string;
  url?: string;
  active?: boolean;
}

export interface SourceDeleteParams {
  sourceId: string;
}

export interface SourceTestCrawlParams {
  sourceId: string;
}

export interface StrategyListParams {
  page?: number;
  limit?: number;
}

export interface AnalystListParams {
  universeId?: string;
  targetId?: string;
  scopeLevel?: string;
}

export interface AnalystCreateParams {
  slug: string;
  name: string;
  perspective: string;
  scopeLevel: string;
  universeId?: string;
  targetId?: string;
  defaultWeight?: number;
}

export interface AnalystUpdateParams {
  analystId: string;
  name?: string;
  perspective?: string;
  defaultWeight?: number;
  active?: boolean;
}

export interface LearningListParams {
  scopeLevel?: string;
  status?: string;
  isTest?: boolean;
  page?: number;
  limit?: number;
}

export interface LearningCreateParams {
  title: string;
  description: string;
  learningType: string;
  scopeLevel: string;
  domain?: string;
  isTest?: boolean;
}

export interface LearningUpdateParams {
  learningId: string;
  title?: string;
  description?: string;
  status?: string;
}

export interface LearningQueueListParams {
  status?: string;
  page?: number;
  limit?: number;
}

export interface LearningQueueRespondParams {
  itemId: string;
  response: 'accept' | 'reject';
  feedback?: string;
}

export interface ReviewQueueListParams {
  reviewType?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface ReviewQueueRespondParams {
  itemId: string;
  response: 'accept' | 'reject' | 'flag';
  notes?: string;
}

export interface MissedOpportunityListParams {
  targetId?: string;
  page?: number;
  limit?: number;
}

export interface ToolRequestListParams {
  status?: string;
  page?: number;
  limit?: number;
}

export interface ToolRequestCreateParams {
  toolName: string;
  params: Record<string, unknown>;
}

export interface ToolRequestUpdateStatusParams {
  requestId: string;
  status: string;
  result?: unknown;
}

export interface LLMCostSummaryParams {
  period?: string;
  startDate?: string;
  endDate?: string;
}

// ============================================================================
// TEST SCENARIO TYPES
// ============================================================================

export type TestScenarioStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface InjectionPoint {
  targetId: string;
  timing: string;
  articleType: string;
}

export interface TestScenarioConfig {
  injectionPoints: InjectionPoint[];
  controlTargets: string[];
  duration?: number;
}

export interface TestScenarioResults {
  accuracy: number;
  controlAccuracy: number;
  improvement: number;
  details: Record<string, unknown>;
}

export interface TestScenario {
  id: string;
  name: string;
  description?: string;
  status: TestScenarioStatus;
  config: TestScenarioConfig;
  results?: TestScenarioResults;
  createdAt: string;
  updatedAt: string;
}

export interface TestScenarioSummary {
  id: string;
  name: string;
  status: TestScenarioStatus;
  createdAt: string;
}

export interface TestScenarioListParams {
  status?: TestScenarioStatus;
  page?: number;
  limit?: number;
}

export interface TestScenarioCreateParams {
  name: string;
  description?: string;
  config: TestScenarioConfig;
}

export interface TestScenarioUpdateParams {
  scenarioId: string;
  name?: string;
  description?: string;
  config?: Partial<TestScenarioConfig>;
}

export interface TestScenarioInjectParams {
  scenarioId: string;
  injectionPoint: InjectionPoint;
}

export interface TestScenarioGenerateParams {
  scenarioId: string;
  targetId: string;
  articleType: string;
}

export interface TestScenarioRunTierParams {
  scenarioId: string;
  tier: 'gold' | 'silver' | 'bronze';
}

export interface TestScenarioCleanupParams {
  scenarioId: string;
}

export interface TierRunResult {
  tier: string;
  success: boolean;
  predictions: number;
  errors: string[];
}

export interface CleanupResult {
  deleted: number;
  success: boolean;
}

export interface InjectResult {
  success: boolean;
  articlesInjected: number;
}

export interface GenerateResult {
  success: boolean;
  article: string;
}

export interface TestScenarioExport {
  scenario: TestScenario;
  results: TestScenarioResults;
  exportedAt: string;
}

// ============================================================================
// REPLAY TEST TYPES
// ============================================================================

export type ReplayTestStatus = 'pending' | 'running' | 'completed' | 'failed';
export type RollbackDepth = 'day' | 'week' | 'month' | 'quarter';

export interface ReplayTestResults {
  originalAccuracy: number;
  replayAccuracy: number;
  improvement: number;
  totalPredictions: number;
}

export interface ReplayTest {
  id: string;
  name: string;
  targetId: string;
  rollbackDepth: RollbackDepth;
  status: ReplayTestStatus;
  results?: ReplayTestResults;
  createdAt: string;
  updatedAt: string;
}

export interface ReplayTestSummary {
  id: string;
  name: string;
  status: ReplayTestStatus;
  createdAt: string;
}

export interface ReplayAffectedRecords {
  predictions: number;
  learnings: number;
  articles: number;
}

export interface ReplayTestResult {
  testId: string;
  results: ReplayTestResults;
  completedAt: string;
}

export interface ReplayTestCreateParams {
  name: string;
  targetId: string;
  rollbackDepth: RollbackDepth;
}

export interface ReplayTestPreviewParams {
  targetId: string;
  rollbackDepth: RollbackDepth;
}

export interface ReplayTestPreviewResult {
  affectedRecords: ReplayAffectedRecords;
  estimatedDuration: number;
}

// ============================================================================
// TEST ARTICLE TYPES
// ============================================================================

export interface TestArticle {
  id: string;
  title: string;
  content: string;
  articleType: string;
  targetId?: string;
  universeId?: string;
  isTest: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TestArticleListParams {
  targetId?: string;
  universeId?: string;
  page?: number;
  limit?: number;
}

export interface TestArticleCreateParams {
  title: string;
  content: string;
  articleType: string;
  targetId?: string;
  universeId?: string;
}

export interface TestArticleUpdateParams {
  articleId: string;
  title?: string;
  content?: string;
}

export interface TestArticleBulkCreateParams {
  articles: TestArticleCreateParams[];
}

export interface GenerateTestArticleParams {
  targetId: string;
  articleType: string;
  prompt?: string;
}

// ============================================================================
// TEST PRICE DATA TYPES
// ============================================================================

export interface TestPriceData {
  id: string;
  targetId: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  isTest: boolean;
  createdAt: string;
}

export interface TestPriceDataListParams {
  targetId: string;
  startDate?: string;
  endDate?: string;
}

export interface TestPriceDataCreateParams {
  targetId: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface TestPriceDataUpdateParams {
  id: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
}

export interface TestPriceDataBulkCreateParams {
  targetId: string;
  entries: Omit<TestPriceDataCreateParams, 'targetId'>[];
}

// ============================================================================
// TEST TARGET MIRROR TYPES
// ============================================================================

export interface TestTargetMirror {
  id: string;
  targetId: string;
  mirrorTargetId: string;
  isActive: boolean;
  createdAt: string;
}

export interface TestTargetMirrorWithTarget extends TestTargetMirror {
  target: PredictionTarget;
  mirrorTarget: PredictionTarget;
}

export interface TestTargetMirrorListParams {
  targetId?: string;
}

export interface TestTargetMirrorCreateParams {
  targetId: string;
  mirrorTargetId: string;
}

export interface TestTargetMirrorEnsureParams {
  targetId: string;
  mirrorTargetId: string;
}
