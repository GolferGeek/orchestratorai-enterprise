/**
 * Risk Agent UI Types
 *
 * Frontend types for the Investment Risk Agent dashboard.
 * Corresponds to the backend risk runner types.
 */

// =============================================================================
// SCOPE TYPES
// =============================================================================

/**
 * LLM configuration for risk analysis
 */
export interface RiskLlmConfig {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Threshold configuration for alerts and debates
 */
export interface RiskThresholdConfig {
  alertThreshold: number;
  debateThreshold: number;
  staleDays: number;
}

/**
 * Analysis features configuration
 */
export interface RiskAnalysisConfig {
  riskRadar?: {
    enabled: boolean;
    parallelDimensions?: boolean;
  };
  debate?: {
    enabled: boolean;
    autoTrigger?: boolean;
  };
  learning?: {
    enabled: boolean;
    autoApprove?: boolean;
  };
}

/**
 * A risk analysis scope (domain/configuration context)
 */
export interface RiskScope {
  id: string;
  organizationSlug: string;
  agentSlug: string;
  name: string;
  domain: string;
  description?: string;
  llmConfig?: RiskLlmConfig;
  thresholdConfig?: RiskThresholdConfig;
  analysisConfig?: RiskAnalysisConfig;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// SUBJECT TYPES
// =============================================================================

/**
 * Subject metadata
 */
export interface RiskSubjectMetadata {
  sector?: string;
  industry?: string;
  marketCap?: number;
  exchange?: string;
  currency?: string;
  [key: string]: unknown;
}

/**
 * A risk analysis subject (entity being analyzed)
 */
export interface RiskSubject {
  id: string;
  scopeId: string;
  identifier: string;
  name: string;
  subjectType: 'stock' | 'crypto' | 'portfolio' | 'fund' | 'bond' | 'custom';
  context?: string;
  metadata?: RiskSubjectMetadata;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// DIMENSION TYPES
// =============================================================================

/**
 * Output schema for dimension analysis
 */
export interface DimensionOutputSchema {
  type: string;
  properties: Record<string, unknown>;
  required?: string[];
}

/**
 * Example for dimension analysis prompt
 */
export interface DimensionExample {
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

/**
 * A risk dimension (factor to analyze)
 */
export interface RiskDimension {
  id: string;
  scopeId: string;
  slug: string;
  name: string;
  description?: string;
  displayName?: string; // Human-friendly display name
  icon?: string; // Icon identifier (e.g., 'chart-line', 'shield')
  color?: string; // Hex color code (e.g., '#EF4444')
  weight: number;
  displayOrder?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * A dimension context (versioned analysis prompt)
 */
export interface RiskDimensionContext {
  id: string;
  dimensionId: string;
  version: number;
  analysisPrompt: string;
  outputSchema?: DimensionOutputSchema;
  examples?: DimensionExample[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// ASSESSMENT TYPES
// =============================================================================

/**
 * A signal detected during assessment
 */
export interface AssessmentSignal {
  type: string;
  description: string;
  impact: 'positive' | 'negative' | 'neutral';
  confidence: number;
  source?: string;
}

/**
 * Raw LLM response from dimension analysis
 */
export interface AssessmentAnalystResponse {
  score: number;
  confidence: number;
  signals: AssessmentSignal[];
  reasoning: string;
  [key: string]: unknown;
}

/**
 * A single dimension assessment
 */
export interface RiskAssessment {
  id: string;
  subjectId: string;
  dimensionId: string;
  dimensionContextId: string;
  taskId: string;
  score: number;
  confidence: number;
  signals: AssessmentSignal[];
  analystResponse: AssessmentAnalystResponse;
  createdAt: string;
  // Joined fields for display
  dimensionSlug?: string;
  dimensionName?: string;
  dimensionWeight?: number;
}

// =============================================================================
// COMPOSITE SCORE TYPES
// =============================================================================

/**
 * Map of dimension scores
 */
export interface DimensionScoreMap {
  [dimensionSlug: string]: {
    score: number;
    confidence: number;
    weight: number;
    assessmentId: string;
  };
}

/**
 * A composite risk score (aggregated from dimensions)
 */
export interface RiskCompositeScore {
  id: string;
  subjectId: string;
  taskId: string;
  score: number;
  confidence: number;
  dimensionScores: DimensionScoreMap;
  debateAdjustment?: number;
  debateId?: string;
  isSuperseded: boolean;
  createdAt: string;
  // Joined fields for display
  subjectName?: string;
  subjectIdentifier?: string;
}

/**
 * Active composite score view (non-superseded)
 */
export interface ActiveCompositeScoreView extends RiskCompositeScore {
  subjectName: string;
  subjectIdentifier: string;
  subjectType: string;
  scopeName: string;
  ageHours: number;
}

// =============================================================================
// DEBATE TYPES
// =============================================================================

/**
 * Blue team (risk defense) assessment
 */
export interface BlueAssessment {
  arguments: string[];
  strengthScore: number;
  mitigatingFactors: string[];
}

/**
 * Red team (risk challenge) challenges
 */
export interface RedChallenges {
  challenges: string[];
  riskScore: number;
  hiddenRisks: string[];
}

/**
 * Arbiter synthesis of debate
 */
export interface ArbiterSynthesis {
  summary: string;
  scoreAdjustment: number;
  keyTakeaways: string[];
  recommendation: string;
}

/**
 * A risk debate (Red Team/Blue Team analysis)
 */
export interface RiskDebate {
  id: string;
  subjectId: string;
  compositeScoreId: string;
  taskId: string;
  blueAssessment: BlueAssessment;
  redChallenges: RedChallenges;
  arbiterSynthesis: ArbiterSynthesis;
  scoreAdjustment: number;
  createdAt: string;
}

/**
 * Debate context (role-specific prompts)
 */
export interface RiskDebateContext {
  id: string;
  scopeId: string;
  role: 'blue' | 'red' | 'arbiter';
  version: number;
  systemPrompt: string;
  outputSchema?: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// ALERT TYPES
// =============================================================================

/**
 * Alert severity levels
 */
export type AlertSeverity = 'info' | 'warning' | 'critical';

/**
 * Alert details
 */
export interface AlertDetails {
  triggerScore?: number;
  threshold?: number;
  previousScore?: number;
  changePercent?: number;
  dimensions?: string[];
  [key: string]: unknown;
}

/**
 * A risk alert
 */
export interface RiskAlert {
  id: string;
  subjectId: string;
  compositeScoreId: string;
  severity: AlertSeverity;
  message: string;
  details?: AlertDetails;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  createdAt: string;
  // Joined fields
  subjectName?: string;
  subjectIdentifier?: string;
}

/**
 * Unacknowledged alert view
 */
export interface UnacknowledgedAlertView extends RiskAlert {
  subjectName: string;
  subjectIdentifier: string;
  scopeName: string;
}

// =============================================================================
// LEARNING TYPES
// =============================================================================

/**
 * Learning configuration
 */
export interface LearningConfig {
  autoPromote?: boolean;
  minReviewCount?: number;
  minAccuracyImprovement?: number;
}

/**
 * A risk learning (improvement to dimension analysis)
 */
export interface RiskLearning {
  id: string;
  scopeId: string;
  dimensionId?: string;
  learningType: 'prompt_improvement' | 'weight_adjustment' | 'threshold_change' | 'new_signal';
  description: string;
  suggestedChange: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Learning queue item
 */
export interface RiskLearningQueueItem {
  id: string;
  learningId: string;
  priority: number;
  status: 'queued' | 'reviewing' | 'completed';
  reviewNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

/**
 * Pending learning view
 */
export interface PendingLearningView extends RiskLearning {
  dimensionSlug?: string;
  dimensionName?: string;
  scopeName: string;
  queuePriority?: number;
}

// =============================================================================
// EVALUATION TYPES
// =============================================================================

/**
 * Actual outcome data
 */
export interface ActualOutcome {
  timestamp: string;
  value: number | string;
  source?: string;
  notes?: string;
}

/**
 * Dimension accuracy metrics
 */
export interface DimensionAccuracy {
  dimensionSlug: string;
  predictedScore: number;
  actualImpact: number;
  accuracy: number;
}

/**
 * A risk evaluation (comparing prediction to outcome)
 */
export interface RiskEvaluation {
  id: string;
  subjectId: string;
  compositeScoreId: string;
  evaluationWindow: string;
  predictedScore: number;
  actualOutcome: ActualOutcome;
  accuracy: number;
  dimensionAccuracies: DimensionAccuracy[];
  notes?: string;
  createdAt: string;
}

// =============================================================================
// DASHBOARD STATE TYPES
// =============================================================================

/**
 * Dashboard view mode
 */
export type DashboardViewMode = 'radar' | 'list' | 'detail';

/**
 * Selected subject for detail view
 */
export interface SelectedSubjectState {
  subject: RiskSubject | null;
  compositeScore: RiskCompositeScore | null;
  assessments: RiskAssessment[];
  debate: RiskDebate | null;
  alerts: RiskAlert[];
  evaluations: RiskEvaluation[];
}

/**
 * Dashboard filter state
 */
export interface RiskDashboardFilters {
  scopeId?: string;
  subjectType?: RiskSubject['subjectType'];
  minScore?: number;
  maxScore?: number;
  hasAlerts?: boolean;
  isStale?: boolean;
}

/**
 * Dashboard statistics
 */
export interface DashboardStats {
  totalSubjects: number;
  analyzedSubjects: number;
  averageScore: number;
  criticalAlerts: number;
  warningAlerts: number;
  pendingLearnings: number;
  staleAssessments: number;
}

/**
 * Complete dashboard state
 */
export interface RiskDashboardState {
  // Current scope
  currentScope: RiskScope | null;
  scopes: RiskScope[];

  // Subjects and scores
  subjects: RiskSubject[];
  compositeScores: ActiveCompositeScoreView[];

  // Selected item detail
  selectedSubject: SelectedSubjectState | null;

  // Dimensions for the current scope
  dimensions: RiskDimension[];

  // Alerts
  alerts: UnacknowledgedAlertView[];

  // Learnings
  pendingLearnings: PendingLearningView[];

  // UI state
  viewMode: DashboardViewMode;
  filters: RiskDashboardFilters;
  stats: DashboardStats;

  // Loading states
  isLoading: boolean;
  isAnalyzing: boolean;
  error: string | null;
}

// =============================================================================
// RADAR CHART TYPES
// =============================================================================

/**
 * Data point for radar chart
 */
export interface RadarChartDataPoint {
  dimension: string;
  score: number;
  confidence: number;
  weight: number;
}

/**
 * Radar chart configuration
 */
export interface RadarChartConfig {
  showLabels: boolean;
  showGrid: boolean;
  showConfidence: boolean;
  fillOpacity: number;
  strokeWidth: number;
  size: number;
}

// =============================================================================
// API REQUEST/RESPONSE TYPES
// =============================================================================

/**
 * Dashboard action request
 */
export interface DashboardActionRequest {
  action: string;
  params?: Record<string, unknown>;
  filters?: RiskDashboardFilters;
  pagination?: {
    page: number;
    limit: number;
  };
}

/**
 * Dashboard action response
 */
export interface DashboardActionResponse<T = unknown> {
  success: boolean;
  content?: T;
  error?: {
    message: string;
    code?: string;
  };
  metadata?: {
    total?: number;
    page?: number;
    limit?: number;
    timestamp?: string;
  };
}

/**
 * Analyze subject request
 */
export interface AnalyzeSubjectRequest {
  subjectId: string;
  forceRefresh?: boolean;
  includeDebate?: boolean;
}

/**
 * Analyze subject response
 */
export interface AnalyzeSubjectResponse {
  compositeScore: RiskCompositeScore;
  assessments: RiskAssessment[];
  debate?: RiskDebate;
  alerts?: RiskAlert[];
}

/**
 * Create subject request
 */
export interface CreateSubjectRequest {
  scopeId: string;
  identifier: string;
  name: string;
  subjectType: RiskSubject['subjectType'];
  context?: string;
  metadata?: RiskSubjectMetadata;
}

/**
 * Update subject request
 */
export interface UpdateSubjectRequest {
  name?: string;
  context?: string;
  metadata?: RiskSubjectMetadata;
  isActive?: boolean;
}

/**
 * Acknowledge alert request
 */
export interface AcknowledgeAlertRequest {
  alertId: string;
  notes?: string;
}

/**
 * Review learning request
 */
export interface ReviewLearningRequest {
  learningId: string;
  action: 'approve' | 'reject';
  notes?: string;
}

// =============================================================================
// SCORE HISTORY TYPES (Feature 1)
// =============================================================================

/**
 * Score history entry with change calculations
 */
export interface ScoreHistoryEntry {
  id: string;
  overallScore: number;
  dimensionScores: DimensionScoreMap;
  confidence: number;
  previousScore: number | null;
  scoreChange: number;
  scoreChangePercent: number;
  debateAdjustment?: number;
  createdAt: string;
}

/**
 * Score trend data for a subject
 */
export interface ScoreTrend {
  subjectId: string;
  currentScore: number;
  change7d: number;
  change30d: number;
  totalAssessments: number;
  avgScore: number;
  maxScore: number;
  minScore: number;
  scoreStddev: number;
  firstAssessment: string;
  latestAssessment: string;
}

// =============================================================================
// HEATMAP TYPES (Feature 4)
// =============================================================================

/**
 * Risk level classification
 */
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

/**
 * Heatmap cell data
 */
export interface HeatmapCell {
  dimensionId: string;
  dimensionSlug: string;
  dimensionName: string;
  icon?: string;
  color?: string;
  score: number | null;
  confidence: number | null;
  riskLevel: RiskLevel;
  riskColor: string;
}

/**
 * Heatmap row (subject with all dimension scores)
 */
export interface HeatmapRow {
  subjectId: string;
  subjectName: string;
  subjectIdentifier: string;
  subjectType: string;
  dimensions: HeatmapCell[];
}

/**
 * Complete heatmap data
 */
export interface HeatmapData {
  rows: HeatmapRow[];
  dimensions: RiskDimension[];
  scopeId: string;
  scopeName: string;
}

// =============================================================================
// PORTFOLIO AGGREGATE TYPES (Feature 6)
// =============================================================================

/**
 * Portfolio aggregate statistics
 */
export interface PortfolioAggregate {
  scopeId: string;
  scopeName: string;
  domain: string;
  subjectCount: number;
  avgScore: number;
  maxScore: number;
  minScore: number;
  scoreStddev: number;
  avgConfidence: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  latestAssessment: string;
  oldestAssessment: string;
}

/**
 * Risk distribution entry
 */
export interface RiskDistribution {
  riskLevel: RiskLevel;
  color: string;
  count: number;
  percentage: number;
}

/**
 * Dimension contribution to overall risk
 */
export interface DimensionContribution {
  dimensionId: string;
  dimensionSlug: string;
  dimensionName: string;
  icon?: string;
  color?: string;
  weight: number;
  assessmentCount: number;
  avgScore: number;
  avgConfidence: number;
  maxScore: number;
  minScore: number;
  weightedContribution: number;
}

// =============================================================================
// CORRELATION TYPES (Feature 7)
// =============================================================================

/**
 * Correlation between two dimensions
 */
export interface DimensionCorrelation {
  dimension1Id: string;
  dimension1Slug: string;
  dimension1Name: string;
  dimension2Id: string;
  dimension2Slug: string;
  dimension2Name: string;
  correlation: number;
  sampleSize: number;
}

/**
 * Full correlation matrix
 */
export interface CorrelationMatrix {
  dimensions: RiskDimension[];
  correlations: DimensionCorrelation[];
  matrix: number[][]; // 2D matrix for visualization
}

// =============================================================================
// SUBJECT COMPARISON TYPES (Feature 2)
// =============================================================================

/**
 * Comparison set (saved comparison configuration)
 */
export interface ComparisonSet {
  id: string;
  scopeId: string;
  name: string;
  subjectIds: string[];
  createdAt: string;
}

/**
 * Subject comparison data
 */
export interface SubjectComparison {
  subjects: RiskSubject[];
  compositeScores: RiskCompositeScore[];
  dimensionComparisons: {
    dimensionSlug: string;
    dimensionName: string;
    icon?: string;
    color?: string;
    scores: { subjectId: string; score: number; rank: number }[];
  }[];
  rankings: {
    subjectId: string;
    subjectName: string;
    overallRank: number;
    dimensionRanks: Record<string, number>;
  }[];
}

// =============================================================================
// EXECUTIVE SUMMARY TYPES (Feature 5)
// =============================================================================

/**
 * Executive summary status based on risk level
 */
export type ExecutiveSummaryStatus = 'critical' | 'high' | 'medium' | 'low' | 'stable';

/**
 * Risk highlights for the summary
 */
export interface RiskHighlights {
  topRisks: Array<{ subject: string; subjectId?: string; score: number; dimension: string }>;
  recentChanges: Array<{ subject: string; subjectId?: string; change: number; direction: 'up' | 'down' }>;
}

/**
 * Executive summary content structure
 */
export interface ExecutiveSummaryContent {
  headline: string;
  status: ExecutiveSummaryStatus;
  keyFindings: string[];
  recommendations: string[];
  riskHighlights: RiskHighlights;
}

/**
 * Complete executive summary
 */
export interface ExecutiveSummary {
  id: string;
  scopeId: string;
  summaryType: 'daily' | 'weekly' | 'ad-hoc';
  content: ExecutiveSummaryContent;
  generatedAt: string;
  expiresAt: string | null;
}

// =============================================================================
// SCENARIO ANALYSIS TYPES (Feature 9)
// =============================================================================

/**
 * Dimension adjustment for a scenario
 */
export interface ScenarioAdjustment {
  dimensionSlug: string;
  adjustment: number; // -1.0 to +1.0
}

/**
 * Subject result from scenario analysis
 */
export interface ScenarioSubjectResult {
  subjectId: string;
  subjectName: string;
  baselineScore: number;
  adjustedScore: number;
  change: number;
  changePercent: number;
  dimensionDetails: Array<{
    dimensionSlug: string;
    baselineScore: number;
    adjustedScore: number;
    adjustment: number;
  }>;
}

/**
 * Complete scenario analysis result
 */
export interface ScenarioResult {
  scenarioName: string;
  adjustments: Record<string, number>;
  portfolioBaseline: number;
  portfolioAdjusted: number;
  portfolioChange: number;
  portfolioChangePercent: number;
  subjectResults: ScenarioSubjectResult[];
  riskDistributionBefore: Record<string, number>;
  riskDistributionAfter: Record<string, number>;
}

/**
 * Saved scenario
 */
export interface Scenario {
  id: string;
  scopeId: string;
  name: string;
  description: string | null;
  adjustments: Record<string, number>;
  baselineSnapshot?: Record<string, unknown>;
  results?: ScenarioResult;
  isTemplate: boolean;
  createdAt: string;
}

// =============================================================================
// PDF REPORT TYPES (Feature 8)
// =============================================================================

/**
 * Report configuration options
 */
export interface ReportConfig {
  includeExecutiveSummary: boolean;
  includeHeatmap: boolean;
  includeSubjectDetails: boolean;
  includeCorrelations: boolean;
  includeTrends: boolean;
  includeDimensionAnalysis: boolean;
  dateRange?: { start: string; end: string };
  subjectFilter?: string[];
}

/**
 * Report status
 */
export type ReportStatus = 'pending' | 'generating' | 'completed' | 'failed';

/**
 * Report type
 */
export type ReportType = 'comprehensive' | 'executive' | 'detailed';

/**
 * Complete report
 */
export interface Report {
  id: string;
  scopeId: string;
  title: string;
  reportType: ReportType;
  config: ReportConfig;
  status: ReportStatus;
  filePath: string | null;
  fileSize: number | null;
  downloadUrl: string | null;
  downloadExpiresAt: string | null;
  errorMessage: string | null;
  generatedAt: string | null;
  createdAt: string;
}

// =============================================================================
// PHASE 4: MONTE CARLO SIMULATION TYPES (Feature 10)
// =============================================================================

/**
 * Distribution types supported by Monte Carlo
 */
export type DistributionType = 'normal' | 'uniform' | 'beta' | 'triangular';

/**
 * Dimension distribution configuration
 */
export interface DimensionDistribution {
  distribution: DistributionType;
  mean?: number;
  stdDev?: number;
  min?: number;
  max?: number;
  alpha?: number; // For beta distribution
  beta?: number; // For beta distribution
}

/**
 * Simulation parameters
 */
export interface SimulationParameters {
  dimensionDistributions: Record<string, DimensionDistribution>;
  confidenceLevel?: number; // Default 0.95
  seed?: number; // Optional seed for reproducibility
}

/**
 * Histogram bin
 */
export interface HistogramBin {
  bin: number;
  count: number;
}

/**
 * Simulation results
 */
export interface SimulationResults {
  mean: number;
  median: number;
  stdDev: number;
  variance: number;
  percentile5: number;
  percentile25: number;
  percentile75: number;
  percentile95: number;
  percentile99: number;
  var95: number; // Value at Risk at 95%
  var99: number; // Value at Risk at 99%
  cvar95: number; // Conditional VaR at 95%
  cvar99: number; // Conditional VaR at 99%
  skewness: number;
  kurtosis: number;
  distribution: HistogramBin[];
  executionTimeMs: number;
}

/**
 * Simulation status
 */
export type SimulationStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Full simulation record
 */
export interface Simulation {
  id: string;
  scopeId: string;
  subjectId: string | null;
  name: string;
  description: string | null;
  iterations: number;
  parameters: SimulationParameters;
  results: SimulationResults | null;
  status: SimulationStatus;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

// =============================================================================
// PHASE 4: LIVE DATA INTEGRATION TYPES (Feature 11)
// =============================================================================

/**
 * Data source types
 */
export type DataSourceType = 'firecrawl' | 'api' | 'rss' | 'webhook' | 'manual';

/**
 * Data source status
 */
export type DataSourceStatus = 'active' | 'paused' | 'error' | 'disabled';

/**
 * Fetch status
 */
export type FetchStatus = 'success' | 'failed' | 'timeout' | 'rate_limited';

/**
 * Schedule presets
 */
export type SchedulePreset = 'hourly' | 'daily' | 'weekly' | 'realtime';

/**
 * Dimension mapping configuration
 */
export interface DimensionMapping {
  sourceField: string;
  transform?: 'normalize' | 'inverse_normalize' | 'scale' | 'none';
  threshold?: number;
  weight?: number;
}

/**
 * Subject filter configuration for data sources
 */
export interface DataSourceSubjectFilter {
  subjectIds?: string[];
  subjectTypes?: string[];
  identifierPattern?: string;
}

/**
 * Firecrawl configuration
 */
export interface FirecrawlConfig {
  url: string;
  selector?: string;
  extractFields?: string[];
  authentication?: {
    type: 'bearer' | 'basic' | 'api_key';
    credentials: string;
  };
}

/**
 * API configuration
 */
export interface ApiConfig {
  endpoint: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  responseMapping?: Record<string, string>;
}

/**
 * RSS configuration
 */
export interface RssConfig {
  feedUrl: string;
  relevantCategories?: string[];
  sentimentAnalysis?: boolean;
}

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  webhookId: string;
  secretKey: string;
  expectedPayloadSchema?: Record<string, unknown>;
}

/**
 * Source configuration (union type)
 */
export type SourceConfig = FirecrawlConfig | ApiConfig | RssConfig | WebhookConfig | Record<string, unknown>;

/**
 * Data source record
 */
export interface DataSource {
  id: string;
  scopeId: string;
  name: string;
  description: string | null;
  sourceType: DataSourceType;
  config: SourceConfig;
  schedule: string | null;
  dimensionMapping: Record<string, DimensionMapping>;
  subjectFilter: DataSourceSubjectFilter | null;
  status: DataSourceStatus;
  errorMessage: string | null;
  errorCount: number;
  lastFetchAt: string | null;
  lastFetchStatus: FetchStatus | null;
  lastFetchData: unknown;
  nextFetchAt: string | null;
  autoReanalyze: boolean;
  reanalyzeThreshold: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fetch history record
 */
export interface FetchHistoryRecord {
  id: string;
  dataSourceId: string;
  status: FetchStatus;
  fetchDurationMs: number | null;
  rawResponse: unknown;
  parsedData: unknown;
  errorMessage: string | null;
  dimensionsUpdated: string[];
  subjectsAffected: string[];
  reanalysisTriggered: boolean;
  reanalysisTaskIds: string[];
  fetchedAt: string;
}

/**
 * Fetch result
 */
export interface FetchResult {
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
  dimensionsUpdated: string[];
  reanalysisTriggered: boolean;
}

/**
 * Data source health summary
 */
export interface DataSourceHealthSummary {
  total: number;
  active: number;
  paused: number;
  error: number;
  disabled: number;
  lastFetchSuccess: number;
  lastFetchFailed: number;
}
