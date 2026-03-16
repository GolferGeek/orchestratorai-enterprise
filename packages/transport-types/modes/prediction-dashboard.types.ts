/**
 * Prediction Dashboard Entity Types
 *
 * Shared entity response types for the prediction system.
 * These are the shapes of entities returned by the prediction-runner API.
 * Used by both frontend (web) and backend (api) for type-safe contracts.
 */

// ============================================================================
// UNIVERSE
// ============================================================================

export interface PredictionUniverse {
  id: string;
  name: string;
  domain: 'stocks' | 'crypto' | 'elections' | 'polymarket';
  description?: string;
  organizationSlug: string;
  agentSlug: string;
  strategyId?: string;
  llmConfig?: {
    provider?: string;
    model?: string;
    tiers?: {
      gold?: { provider: string; model: string };
      silver?: { provider: string; model: string };
      bronze?: { provider: string; model: string };
    };
  };
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// TARGET
// ============================================================================

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

// ============================================================================
// INSTRUMENT PRICE DATA
// ============================================================================

export type PriceHistoryPeriod = 'day' | '2days' | '3days' | 'week' | 'month';

export interface InstrumentPrice {
  id: string;
  symbol: string;
  name: string;
  targetType: string;
  universeId: string;
  currentPrice: number | null;
  priceUpdatedAt: string | null;
  change24hAbsolute: number | null;
  change24hPercent: number | null;
}

export interface PriceHistoryData {
  target: {
    id: string;
    symbol: string;
    name: string;
    targetType: string;
    currentPrice: number | null;
  };
  period: PriceHistoryPeriod;
  hours: number;
  snapshots: Array<{
    id: string;
    targetId: string;
    value: number;
    valueType: string;
    source: string;
    createdAt: string;
  }>;
  change: {
    startValue: number | null;
    endValue: number | null;
    changeAbsolute: number | null;
    changePercent: number | null;
  };
}

// ============================================================================
// DAILY REPORT
// ============================================================================

export interface DailyReportSummary {
  runDate: string;
  overnightMoveThresholdPct: number;
  overnightCandidates: number;
  recommendations: number;
  actorScorecard: Record<string, unknown>;
}

export interface DailyReportRun {
  id: string;
  orgSlug: string;
  agentSlug: string;
  runDate: string;
  status: string;
  summary: DailyReportSummary;
  reportMarkdown: string;
  reportHtml: string;
  reportJson: Record<string, unknown>;
  createdBy: string;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

export interface DailyReportRecommendation {
  id: string;
  runId: string;
  recommendationType: 'context_update' | 'source_candidate' | 'replay_experiment';
  scopeLevel:
    | 'instrument_context'
    | 'domain_context'
    | 'prediction_global_context';
  targetId: string | null;
  targetSymbol: string | null;
  title: string;
  rationale: string;
  proposedChange: Record<string, unknown>;
  confidence: number;
  status: 'pending' | 'approved' | 'rejected' | 'applied' | 'escalated';
  actionSource: string | null;
  actionNote: string | null;
  actionedBy: string | null;
  actionedAt: string | null;
  createdAt: string;
}

// ============================================================================
// PREDICTION
// ============================================================================

export interface TierResult {
  provider: string;
  model: string;
  direction: 'up' | 'down' | 'flat';
  confidence: number;
  reasoning: string;
}

export interface Prediction {
  id: string;
  targetId: string;
  universeId: string;
  taskId?: string;
  status: 'active' | 'resolved' | 'expired' | 'cancelled';
  direction: 'up' | 'down' | 'flat';
  confidence: number;
  magnitude?: number;
  timeframe?: string;
  entryValue?: number;
  exitValue?: number;
  generatedAt: string;
  resolvedAt?: string;
  expiresAt?: string;
  llmEnsembleResults?: {
    gold?: TierResult;
    silver?: TierResult;
    bronze?: TierResult;
  };
  analystCount?: number;
  predictorCount?: number;
  targetName?: string;
  targetSymbol?: string;
  universeName?: string;
  domain?: string;
  isTest?: boolean;
  // Outcome and reasoning fields (populated when prediction is resolved)
  outcomeValue?: number;
  rationale?: string;
  notes?: string;
  // Per-analyst prediction fields
  analystSlug?: string;
  isArbitrator?: boolean;
  reasoning?: string;
  // Analyst opinions embedded in arbitrator prediction
  analystAssessments?: Array<{
    analystSlug: string;
    analystName?: string;
    direction: string;
    confidence: number;
    reasoning?: string;
    // Three-way fork assessments
    userFork?: {
      direction: string;
      confidence: number;
      reasoning?: string;
    };
    aiFork?: {
      direction: string;
      confidence: number;
      reasoning?: string;
    };
    arbitratorFork?: {
      direction: string;
      confidence: number;
      reasoning?: string;
    };
  }>;
  // Fork comparison metadata
  forkMetadata?: {
    totalAnalysts: number;
    userVsAiAgreement: number;
    arbitratorAgreesWithUser: number;
    arbitratorAgreesWithAi: number;
  };
}

export interface PredictionSnapshot {
  id: string;
  predictionId: string;
  predictors: Array<{
    id: string;
    direction: string;
    strength: number;
    reasoning: string;
    signalId: string;
  }>;
  rejectedSignals: Array<{
    id: string;
    reason: string;
    content: string;
  }>;
  analystAssessments: Array<{
    analystSlug: string;
    analystName: string;
    tier: 'gold' | 'silver' | 'bronze';
    direction: string;
    confidence: number;
    reasoning: string;
  }>;
  llmEnsembleResults: {
    gold?: TierResult;
    silver?: TierResult;
    bronze?: TierResult;
  };
  appliedLearnings: Array<{
    id: string;
    title: string;
    learningType: string;
    content: string;
  }>;
  thresholdEvaluation: {
    minPredictors: number;
    actualPredictors: number;
    minStrength: number;
    actualStrength: number;
    minConsensus: number;
    actualConsensus: number;
    passed: boolean;
  };
  timeline: Array<{
    timestamp: string;
    event: string;
    details?: string;
  }>;
  createdAt: string;
}

/**
 * Full prediction lineage data from deep-dive endpoint
 * Includes complete chain: Prediction -> Predictors -> Signals -> Articles
 */
export interface PredictionDeepDive {
  prediction: {
    id: string;
    targetId: string;
    direction: string;
    magnitude?: string;
    confidence: number;
    timeframeHours?: number;
    status: string;
    predictedAt: string;
    expiresAt?: string;
    outcomeValue?: number;
    resolutionNotes?: string;
    reasoning?: string;
  };
  lineage: {
    predictors: Array<{
      id: string;
      direction: string;
      strength: number;
      confidence: number;
      reasoning?: string;
      analystSlug?: string;
      createdAt: string;
      signal: {
        id: string;
        content: string;
        direction: string;
        urgency?: string;
        sourceId: string;
        detectedAt: string;
        url?: string;
      } | null;
      fingerprint: {
        titleNormalized?: string;
        keyPhrases?: string[];
        fingerprintHash?: string;
      } | null;
      sourceArticle: {
        url?: string;
        title?: string;
        firstSeenAt?: string;
        contentHash?: string;
      } | null;
    }>;
    analystAssessments: Array<{
      analystSlug: string;
      tier: string;
      direction: string;
      confidence: number;
      reasoning?: string;
      keyFactors?: string[];
      risks?: string[];
      learningsApplied?: string[];
    }>;
    llmEnsemble: {
      tiers_used?: string[];
      tier_results?: Record<string, {
        direction: string;
        confidence: number;
        model: string;
        provider: string;
      }>;
      agreement_level?: number;
    } | null;
    thresholdEvaluation: {
      min_predictors?: number;
      actual_predictors?: number;
      min_combined_strength?: number;
      actual_combined_strength?: number;
      min_consensus?: number;
      actual_consensus?: number;
      passed?: boolean;
    } | null;
    timeline: Array<{
      timestamp: string;
      event_type: string;
      details?: Record<string, unknown>;
    }>;
  };
  stats: {
    predictorCount: number;
    signalCount: number;
    analystCount: number;
    averageConfidence: number;
  };
}

// ============================================================================
// SOURCE
// ============================================================================

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
  itemsFound: number;
  sampleItems: Array<{
    title: string;
    content: string;
    url?: string;
    extractedAt: string;
  }>;
  errors?: string[];
}

// ============================================================================
// STRATEGY
// ============================================================================

export interface PredictionStrategy {
  id: string;
  slug: string;
  name: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  parameters: {
    minPredictors?: number;
    minCombinedStrength?: number;
    minDirectionConsensus?: number;
    [key: string]: unknown;
  };
  isSystem: boolean;
}

// ============================================================================
// ANALYST
// ============================================================================

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

// ============================================================================
// LEARNING
// ============================================================================

export interface PredictionLearning {
  id: string;
  title: string;
  scopeLevel: 'runner' | 'domain' | 'universe' | 'target';
  domain?: string;
  universeId?: string;
  targetId?: string;
  analystId?: string;
  learningType: 'rule' | 'pattern' | 'weight_adjustment' | 'threshold' | 'avoid';
  content: string;
  sourceType: 'human' | 'ai_suggested' | 'ai_approved';
  status: 'active' | 'superseded' | 'inactive';
  supersededBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LearningQueueItem {
  id: string;
  suggestedTitle: string;
  suggestedContent: string;
  suggestedLearningType: string;
  suggestedScopeLevel: string;
  suggestedDomain?: string;
  suggestedUniverseId?: string;
  suggestedTargetId?: string;
  suggestedAnalystId?: string;
  sourceEvaluationId?: string;
  sourceMissedOpportunityId?: string;
  confidence: number;
  reasoning: string;
  status: 'pending' | 'approved' | 'rejected' | 'modified';
  finalLearningId?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  createdAt: string;
}

// ============================================================================
// REVIEW QUEUE
// ============================================================================

export interface ReviewQueueItem {
  id: string;
  signalId: string;
  targetId: string;
  targetName: string;
  targetSymbol: string;
  signalContent: string;
  sourceName: string;
  sourceType: string;
  receivedAt: string;
  aiDisposition: 'bullish' | 'bearish' | 'neutral';
  aiStrength: number;
  aiReasoning: string;
  aiConfidence: number;
  status: 'pending' | 'approved' | 'rejected' | 'modified';
  modifiedDisposition?: 'bullish' | 'bearish' | 'neutral';
  modifiedStrength?: number;
  reviewerNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

// ============================================================================
// AGENT ACTIVITY (Self-Modification Notifications)
// ============================================================================

export type AgentModificationType =
  | 'rule_added'
  | 'rule_removed'
  | 'weight_changed'
  | 'journal_entry'
  | 'status_change';

export interface AgentActivityItem {
  id: string;
  analystId: string;
  analystName?: string;
  modificationType: AgentModificationType;
  summary: string;
  details: Record<string, unknown>;
  triggerReason: string;
  performanceContext: Record<string, unknown>;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  createdAt: string;
}

// ============================================================================
// LEARNING SESSION (Bidirectional Learning)
// ============================================================================

export type ExchangeOutcome = 'adopted' | 'rejected' | 'noted' | 'pending';
export type ExchangeInitiator = 'user' | 'agent';

export interface LearningExchange {
  id: string;
  analystId: string;
  analystName?: string;
  initiatedBy: ExchangeInitiator;
  question: string;
  response: string | null;
  contextDiff: Record<string, unknown>;
  performanceEvidence: Record<string, unknown>;
  outcome: ExchangeOutcome;
  adoptionDetails: Record<string, unknown> | null;
  createdAt: string;
}

export interface ForkComparisonReport {
  analystId: string;
  analystName: string;
  period: string;
  userFork: {
    currentBalance: number;
    totalPnl: number;
    winRate: number;
    winCount: number;
    lossCount: number;
  };
  agentFork: {
    currentBalance: number;
    totalPnl: number;
    winRate: number;
    winCount: number;
    lossCount: number;
  };
  contextDiffs: Array<{
    field: string;
    userValue: string;
    agentValue: string;
  }>;
  divergentPredictions: Array<{
    predictionId: string;
    targetSymbol: string;
    userDirection: string;
    agentDirection: string;
    userConfidence: number;
    agentConfidence: number;
    actualOutcome: string;
  }>;
}

export interface LearningSessionResponse {
  analystId: string;
  analystName: string;
  comparisonReport: ForkComparisonReport;
  exchanges: LearningExchange[];
}

export interface AnalystContextVersion {
  id: string;
  analystId: string;
  forkType: 'user' | 'agent';
  versionNumber: number;
  perspective: string;
  tierInstructions: Record<string, string>;
  defaultWeight: number;
  agentJournal: string | null;
  changeReason: string;
  changedBy: string;
  isCurrent: boolean;
  createdAt: string;
}

// ============================================================================
// MISSED OPPORTUNITY
// ============================================================================

export interface MissedOpportunity {
  id: string;
  targetId: string;
  targetName: string;
  targetSymbol: string;
  moveStartAt: string;
  moveEndAt: string;
  startValue: number;
  endValue: number;
  movePercent: number;
  direction: 'up' | 'down';
  discoveredDrivers?: string[];
  signalsWeHad?: Array<{ id: string; content: string; reason: string }>;
  sourceGaps?: string[];
  suggestedLearnings?: string[];
  analysisStatus: 'pending' | 'analyzed' | 'actioned';
  createdAt: string;
}

export interface MissedOpportunityAnalysis {
  id: string;
  missedOpportunityId: string;
  drivers: Array<{ driver: string; confidence: number; sources: string[] }>;
  signalAnalysis: Array<{
    signalId: string;
    reason: string;
    shouldHaveActed: boolean;
  }>;
  sourceRecommendations: Array<{
    sourceType: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
  }>;
  learningRecommendations: Array<{
    title: string;
    content: string;
    learningType: string;
  }>;
  summary: string;
  createdAt: string;
}

// ============================================================================
// TOOL REQUEST
// ============================================================================

export interface ToolRequest {
  id: string;
  universeId: string;
  universeName: string;
  targetId?: string;
  targetName?: string;
  requestType: 'source' | 'integration' | 'feature';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'wishlist' | 'planned' | 'in_progress' | 'done' | 'rejected';
  sourceType?: string;
  sourceMissedOpportunityId?: string;
  statusNotes?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// LLM COST
// ============================================================================

export interface LLMCostSummary {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  costByTier: {
    gold: number;
    silver: number;
    bronze: number;
  };
  costByUniverse: Array<{ universeId: string; universeName: string; cost: number }>;
  dailyCosts: Array<{ date: string; cost: number }>;
}

export interface LLMCostSummaryParams {
  universeId?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
}

// ============================================================================
// TEST SCENARIO
// ============================================================================

export type TestScenarioStatus = 'active' | 'running' | 'completed' | 'failed' | 'archived';

export type InjectionPoint =
  | 'strategies'
  | 'universes'
  | 'targets'
  | 'sources'
  | 'source_crawls'
  | 'source_seen_items'
  | 'signal_fingerprints'
  | 'signals'
  | 'predictors'
  | 'predictions'
  | 'snapshots'
  | 'evaluations'
  | 'target_snapshots'
  | 'missed_opportunities'
  | 'tool_requests'
  | 'analysts'
  | 'learnings'
  | 'learning_queue'
  | 'review_queue';

export interface TestScenarioConfig {
  auto_run_tiers?: boolean;
  tiers_to_run?: string[];
  tier_config?: Record<string, unknown>;
}

export interface TestScenarioResults {
  items_injected?: Record<string, number>;
  items_generated?: Record<string, number>;
  tier_results?: Record<
    string,
    {
      success: boolean;
      processed: number;
      created: number;
      errors: string[];
    }
  >;
  errors?: string[];
}

export interface TestScenario {
  id: string;
  name: string;
  description: string | null;
  injection_points: InjectionPoint[];
  target_id: string | null;
  organization_slug: string;
  config: TestScenarioConfig;
  created_by: string | null;
  status: TestScenarioStatus;
  results: TestScenarioResults | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface TestScenarioSummary extends TestScenario {
  data_counts: Record<string, number>;
}

export interface TestScenarioListParams {
  status?: TestScenarioStatus;
  targetId?: string;
  page?: number;
  pageSize?: number;
}

export interface TestScenarioCreateParams {
  name: string;
  description?: string;
  injection_points: InjectionPoint[];
  target_id?: string;
  config?: TestScenarioConfig;
}

export interface TestScenarioUpdateParams {
  id: string;
  name?: string;
  description?: string;
  injection_points?: InjectionPoint[];
  target_id?: string | null;
  config?: TestScenarioConfig;
  status?: TestScenarioStatus;
}

export interface TestScenarioInjectParams {
  scenarioId: string;
  table: InjectionPoint;
  data: unknown[];
}

export interface TestScenarioGenerateParams {
  scenarioId: string;
  type: 'signals' | 'predictions' | 'articles';
  config: {
    count: number;
    target_id?: string;
    source_id?: string;
    topic?: string;
    sentiment?: 'bullish' | 'bearish' | 'mixed';
    distribution?: { bullish?: number; bearish?: number; neutral?: number };
    accuracy_rate?: number;
  };
}

export interface TestScenarioRunTierParams {
  scenarioId: string;
  tier: 'signal-detection' | 'prediction-generation' | 'evaluation';
}

export interface TestScenarioCleanupParams {
  scenarioId?: string;
  cleanupAll?: boolean;
}

export interface TierRunResult {
  tier: string;
  success: boolean;
  items_processed: number;
  items_created: number;
  duration_ms: number;
  errors: string[];
}

export interface CleanupResult {
  cleanup_type: 'scenario' | 'all';
  scenario_id?: string;
  tables_cleaned: Array<{
    table_name: string;
    rows_deleted: number;
  }>;
  total_deleted: number;
}

export interface InjectResult {
  table: string;
  injected_count: number;
  items: unknown[];
}

export interface GenerateResult {
  type: string;
  generated_count: number;
  injected_count?: number;
  items: unknown[];
  outcomes?: Array<{
    prediction_index: number;
    expected_outcome: string;
    actual_direction: string;
  }>;
}

export interface TestScenarioExport {
  version: string;
  exportedAt: string;
  scenario: {
    name: string;
    description: string | null;
    injection_points: InjectionPoint[];
    target_id: string | null;
    config: TestScenarioConfig;
  };
  data?: {
    signals?: unknown[];
    predictors?: unknown[];
    predictions?: unknown[];
    outcomes?: unknown[];
    learnings?: unknown[];
  };
}

// ============================================================================
// HISTORICAL REPLAY TESTS
// ============================================================================

export type ReplayTestStatus = 'pending' | 'snapshot_created' | 'running' | 'completed' | 'failed' | 'restored';
export type RollbackDepth = 'predictions' | 'predictors' | 'signals';

export interface ReplayTestResults {
  total_comparisons: number;
  direction_matches: number;
  original_correct_count: number;
  replay_correct_count: number;
  improvements: number;
  original_accuracy_pct: number | null;
  replay_accuracy_pct: number | null;
  accuracy_delta: number | null;
  total_pnl_original: number | null;
  total_pnl_replay: number | null;
  pnl_delta: number | null;
  avg_confidence_diff: number | null;
}

export interface ReplayTest {
  id: string;
  organization_slug: string;
  name: string;
  description: string | null;
  status: ReplayTestStatus;
  rollback_depth: RollbackDepth;
  rollback_to: string;
  universe_id: string | null;
  target_ids: string[] | null;
  config: Record<string, unknown>;
  results: ReplayTestResults | null;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface ReplayTestSummary extends ReplayTest {
  total_comparisons: number;
  direction_matches: number;
  original_correct_count: number;
  replay_correct_count: number;
  improvements: number;
  original_accuracy_pct: number | null;
  replay_accuracy_pct: number | null;
  total_pnl_original: number | null;
  total_pnl_replay: number | null;
  total_pnl_improvement: number | null;
  avg_confidence_diff: number | null;
}

export interface ReplayAffectedRecords {
  table_name: string;
  record_ids: string[];
  row_count: number;
}

export interface ReplayTestResult {
  id: string;
  replay_test_id: string;
  target_id: string | null;
  original_prediction_id: string | null;
  original_direction: string | null;
  original_confidence: number | null;
  replay_prediction_id: string | null;
  replay_direction: string | null;
  replay_confidence: number | null;
  direction_match: boolean | null;
  confidence_diff: number | null;
  original_correct: boolean | null;
  replay_correct: boolean | null;
  improvement: boolean | null;
  pnl_original: number | null;
  pnl_replay: number | null;
  pnl_diff: number | null;
  created_at: string;
}

export interface ReplayTestCreateParams {
  name: string;
  description?: string;
  rollbackDepth: RollbackDepth;
  rollbackTo: string;
  universeId: string;
  targetIds?: string[];
  config?: Record<string, unknown>;
}

export interface ReplayTestPreviewParams {
  rollbackDepth: RollbackDepth;
  rollbackTo: string;
  universeId: string;
  targetIds?: string[];
}

export interface ReplayTestPreviewResult {
  rollback_depth: RollbackDepth;
  rollback_to: string;
  universe_id: string;
  target_ids: string[] | undefined;
  total_records: number;
  by_table: ReplayAffectedRecords[];
}

// ============================================================================
// TEST ARTICLES
// ============================================================================

export interface TestArticle {
  id: string;
  scenario_id: string;
  title: string;
  content: string;
  target_symbols: string[];
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed' | null;
  expected_signal_count: number | null;
  source_name: string;
  source_type: string;
  published_at: string | null;
  metadata: Record<string, unknown> | null;
  is_processed: boolean;
  created_at: string;
  updated_at: string;
}

export interface TestArticleListParams {
  scenarioId?: string;
  targetSymbol?: string;
  isProcessed?: boolean;
  sentiment?: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  page?: number;
  pageSize?: number;
}

export interface TestArticleCreateParams {
  scenario_id: string;
  title: string;
  content: string;
  target_symbols: string[];
  sentiment?: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  expected_signal_count?: number;
  source_name?: string;
  source_type?: string;
  published_at?: string;
  metadata?: Record<string, unknown>;
}

export interface TestArticleUpdateParams {
  id: string;
  title?: string;
  content?: string;
  target_symbols?: string[];
  sentiment?: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  expected_signal_count?: number;
  source_name?: string;
  source_type?: string;
  published_at?: string;
  metadata?: Record<string, unknown>;
}

export interface TestArticleBulkCreateParams {
  scenario_id: string;
  articles: Array<Omit<TestArticleCreateParams, 'scenario_id'>>;
}

export interface GenerateTestArticleParams {
  target_symbols: string[];
  scenario_type: 'earnings_beat' | 'earnings_miss' | 'scandal' | 'regulatory' | 'acquisition' | 'macro_shock' | 'technical' | 'custom';
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  strength: 'strong' | 'moderate' | 'weak';
  custom_prompt?: string;
  article_count?: number;
  scenario_id?: string;
}

// ============================================================================
// TEST PRICE DATA
// ============================================================================

export interface TestPriceData {
  id: string;
  scenario_id: string;
  symbol: string;
  price_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface TestPriceDataListParams {
  scenarioId?: string;
  symbol?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface TestPriceDataCreateParams {
  scenario_id: string;
  symbol: string;
  price_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  metadata?: Record<string, unknown>;
}

export interface TestPriceDataUpdateParams {
  id: string;
  price_date?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  metadata?: Record<string, unknown>;
}

export interface TestPriceDataBulkCreateParams {
  scenario_id: string;
  symbol: string;
  prices: Array<{
    price_date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>;
}

// ============================================================================
// TEST TARGET MIRROR
// ============================================================================

export interface TestTargetMirror {
  id: string;
  organization_slug: string;
  production_target_id: string;
  test_symbol: string;
  created_at: string;
  updated_at: string;
}

export interface TestTargetMirrorWithTarget extends TestTargetMirror {
  production_target?: {
    id: string;
    name: string;
    symbol: string;
    universe_id: string;
    target_type: string;
  };
}

export interface TestTargetMirrorListParams {
  includeTargetDetails?: boolean;
  page?: number;
  pageSize?: number;
}

export interface TestTargetMirrorCreateParams {
  production_target_id: string;
  test_symbol: string;
}

export interface TestTargetMirrorEnsureParams {
  productionTargetId: string;
  baseSymbol?: string;
}
