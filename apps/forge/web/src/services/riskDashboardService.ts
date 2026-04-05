/**
 * Risk Dashboard Service
 *
 * READ-ONLY. Enterprise displays data produced by Diviner.
 * All reads route through divinerBridgeService → Bridge (Gatekeeper) → Diviner.
 *
 * Enterprise never writes, triggers, or modifies risk data.
 */

import { divinerBridgeService } from '@/services/divinerBridgeService';
import type {
  RiskScope,
  RiskSubject,
  RiskDimension,
  RiskDimensionContext,
  RiskAssessment,
  RiskCompositeScore,
  ActiveCompositeScoreView,
  RiskDebate,
  RiskDebateContext,
  RiskAlert,
  UnacknowledgedAlertView,
  RiskLearning,
  PendingLearningView,
  RiskEvaluation,
  DashboardStats,
  DashboardActionResponse,
  // Feature 1: Score History
  ScoreHistoryEntry,
  ScoreTrend,
  // Feature 2: Subject Comparison
  SubjectComparison,
  ComparisonSet,
  // Feature 4: Heatmap
  HeatmapData,
  // Feature 5: Executive Summary
  ExecutiveSummary,
  // Feature 6: Portfolio Aggregate
  PortfolioAggregate,
  RiskDistribution,
  DimensionContribution,
  // Feature 7: Correlation
  CorrelationMatrix,
  // Feature 8: PDF Reports
  Report,
  // Feature 9: Scenario Analysis
  Scenario,
  ScenarioResult,
  // Feature 10: Monte Carlo Simulation
  Simulation,
  SimulationParameters,
  DimensionDistribution,
  // Feature 11: Live Data Integration
  DataSource,
  DataSourceType,
  DataSourceStatus,
  FetchHistoryRecord,
  DataSourceHealthSummary,
} from '@/types/risk-agent';

// ============================================================================
// SERVICE CLASS
// ============================================================================

class RiskDashboardService {
  // Local context fields stored for callers that set them via the config setters below.
  // divinerBridgeService uses its own ExecutionContext, so these are not forwarded there —
  // they exist solely to satisfy components that call setOrgSlug/setAgentSlug/setDashboardConversationId.
  private _orgSlug: string | null = null;
  private _agentSlug: string | null = null;
  private _dashboardConversationId: string | null = null;

  setOrgSlug(orgSlug: string): void {
    this._orgSlug = orgSlug;
  }

  setAgentSlug(agentSlug: string): void {
    this._agentSlug = agentSlug;
  }

  setDashboardConversationId(conversationId: string): void {
    this._dashboardConversationId = conversationId;
  }

  /**
   * Route a read action through Bridge → Diviner and return a DashboardActionResponse.
   */
  private async read<T>(
    action: string,
    params?: Record<string, unknown>
  ): Promise<DashboardActionResponse<T>> {
    const result = await divinerBridgeService.executeDashboardAction<T>(action, params);
    return {
      success: result.success,
      content: result.content,
      metadata: (result.metadata as Record<string, unknown> | undefined) ?? null,
    };
  }

  // ==========================================================================
  // SCOPE OPERATIONS (read-only)
  // ==========================================================================

  async listScopes(filters?: { isActive?: boolean }): Promise<DashboardActionResponse<RiskScope[]>> {
    return this.read<RiskScope[]>('scopes.list', filters);
  }

  async getScope(id: string): Promise<DashboardActionResponse<RiskScope>> {
    return this.read<RiskScope>('scopes.get', { id });
  }

  // ==========================================================================
  // SUBJECT OPERATIONS (read-only)
  // ==========================================================================

  async listSubjects(filters?: {
    scopeId?: string;
    subjectType?: string;
    isActive?: boolean;
  }): Promise<DashboardActionResponse<RiskSubject[]>> {
    return this.read<RiskSubject[]>('subjects.list', filters);
  }

  async getSubject(id: string): Promise<DashboardActionResponse<RiskSubject>> {
    return this.read<RiskSubject>('subjects.get', { id });
  }

  // ==========================================================================
  // DIMENSION OPERATIONS (read-only)
  // ==========================================================================

  async listDimensions(scopeId: string): Promise<DashboardActionResponse<RiskDimension[]>> {
    return this.read<RiskDimension[]>('dimensions.list', { scopeId });
  }

  async getDimension(id: string): Promise<DashboardActionResponse<RiskDimension>> {
    return this.read<RiskDimension>('dimensions.get', { id });
  }

  // ==========================================================================
  // DIMENSION CONTEXT OPERATIONS (read-only)
  // ==========================================================================

  async listDimensionContexts(dimensionId: string): Promise<DashboardActionResponse<RiskDimensionContext[]>> {
    return this.read<RiskDimensionContext[]>('dimension-contexts.list', { dimensionId });
  }

  async getActiveDimensionContext(dimensionId: string): Promise<DashboardActionResponse<RiskDimensionContext>> {
    return this.read<RiskDimensionContext>('dimension-contexts.get-active', { dimensionId });
  }

  // ==========================================================================
  // COMPOSITE SCORE OPERATIONS (read-only)
  // ==========================================================================

  async listCompositeScores(filters?: {
    scopeId?: string;
    minScore?: number;
    maxScore?: number;
  }): Promise<DashboardActionResponse<ActiveCompositeScoreView[]>> {
    return this.read<ActiveCompositeScoreView[]>('composite-scores.list', filters);
  }

  async getCompositeScore(id: string): Promise<DashboardActionResponse<RiskCompositeScore>> {
    return this.read<RiskCompositeScore>('composite-scores.get', { id });
  }

  async getCompositeScoreBySubject(subjectId: string): Promise<DashboardActionResponse<RiskCompositeScore>> {
    return this.read<RiskCompositeScore>('composite-scores.get-by-subject', { subjectId });
  }

  async getCompositeScoreHistory(
    subjectId: string,
    pagination?: { page?: number; pageSize?: number }
  ): Promise<DashboardActionResponse<RiskCompositeScore[]>> {
    return this.read<RiskCompositeScore[]>('composite-scores.history', { subjectId, ...pagination });
  }

  // ==========================================================================
  // ASSESSMENT OPERATIONS (read-only)
  // ==========================================================================

  async listAssessments(filters?: {
    subjectId?: string;
    dimensionId?: string;
  }): Promise<DashboardActionResponse<RiskAssessment[]>> {
    return this.read<RiskAssessment[]>('assessments.list', filters);
  }

  async getAssessment(id: string): Promise<DashboardActionResponse<RiskAssessment>> {
    return this.read<RiskAssessment>('assessments.get', { id });
  }

  async getAssessmentsBySubject(subjectId: string): Promise<DashboardActionResponse<RiskAssessment[]>> {
    return this.read<RiskAssessment[]>('assessments.get-by-subject', { subjectId });
  }

  async getAssessmentsByTask(taskId: string): Promise<DashboardActionResponse<RiskAssessment[]>> {
    return this.read<RiskAssessment[]>('assessments.get-by-task', { taskId });
  }

  // ==========================================================================
  // DEBATE OPERATIONS (read-only)
  // ==========================================================================

  async listDebates(subjectId: string): Promise<DashboardActionResponse<RiskDebate[]>> {
    return this.read<RiskDebate[]>('debates.list', { subjectId });
  }

  async getDebate(id: string): Promise<DashboardActionResponse<RiskDebate>> {
    return this.read<RiskDebate>('debates.get', { id });
  }

  async getLatestDebate(subjectId: string): Promise<DashboardActionResponse<RiskDebate>> {
    return this.read<RiskDebate>('debates.get-latest', { subjectId });
  }

  // ==========================================================================
  // DEBATE CONTEXT OPERATIONS (read-only)
  // ==========================================================================

  async listDebateContexts(scopeId: string): Promise<DashboardActionResponse<RiskDebateContext[]>> {
    return this.read<RiskDebateContext[]>('debates.contexts.list', { scopeId });
  }

  async getDebateContext(scopeId: string, role: 'blue' | 'red' | 'arbiter'): Promise<DashboardActionResponse<RiskDebateContext>> {
    return this.read<RiskDebateContext>('debates.contexts.get', { scopeId, role });
  }

  // ==========================================================================
  // ALERT OPERATIONS (read-only)
  // ==========================================================================

  async listAlerts(filters?: {
    scopeId?: string;
    subjectId?: string;
    severity?: 'info' | 'warning' | 'critical';
    unacknowledgedOnly?: boolean;
  }): Promise<DashboardActionResponse<UnacknowledgedAlertView[]>> {
    return this.read<UnacknowledgedAlertView[]>('alerts.list', filters);
  }

  async getAlert(id: string): Promise<DashboardActionResponse<RiskAlert>> {
    return this.read<RiskAlert>('alerts.get', { id });
  }

  async getAlertCounts(): Promise<DashboardActionResponse<{ critical: number; warning: number; info: number }>> {
    return this.read<{ critical: number; warning: number; info: number }>('alerts.counts');
  }

  async getAlertWithContext(alertId: string): Promise<DashboardActionResponse<{
    alert: RiskAlert;
    context: {
      assessment?: {
        dimension_slug: string;
        dimension_name: string;
        score: number;
        confidence: number;
        reasoning?: string;
        signals?: Array<{ description: string; impact: string }>;
        evidence?: string;
      };
      previousAssessment?: {
        score: number;
        reasoning?: string;
        signals?: Array<{ description: string; impact: string }>;
      };
    };
  }>> {
    return this.read('alerts.getWithContext', { alertId });
  }

  // ==========================================================================
  // LEARNING OPERATIONS (read-only)
  // ==========================================================================

  async listLearnings(filters?: {
    scopeId?: string;
    dimensionId?: string;
    status?: 'pending' | 'approved' | 'rejected' | 'applied';
  }): Promise<DashboardActionResponse<PendingLearningView[]>> {
    return this.read<PendingLearningView[]>('learnings.list', filters);
  }

  async getLearning(id: string): Promise<DashboardActionResponse<RiskLearning>> {
    return this.read<RiskLearning>('learnings.get', { id });
  }

  // ==========================================================================
  // EVALUATION OPERATIONS (read-only)
  // ==========================================================================

  async listEvaluations(subjectId: string): Promise<DashboardActionResponse<RiskEvaluation[]>> {
    return this.read<RiskEvaluation[]>('evaluations.list', { subjectId });
  }

  async getEvaluation(id: string): Promise<DashboardActionResponse<RiskEvaluation>> {
    return this.read<RiskEvaluation>('evaluations.get', { id });
  }

  // ==========================================================================
  // DASHBOARD STATISTICS (read-only)
  // ==========================================================================

  async getDashboardStats(scopeId?: string): Promise<DashboardActionResponse<DashboardStats>> {
    return this.read<DashboardStats>('dashboard.stats', scopeId ? { scopeId } : undefined);
  }

  async getSubjectDetail(subjectId: string): Promise<DashboardActionResponse<{
    subject: RiskSubject;
    compositeScore: RiskCompositeScore | null;
    assessments: RiskAssessment[];
    debate: RiskDebate | null;
    alerts: RiskAlert[];
    evaluations: RiskEvaluation[];
  }>> {
    return this.read('dashboard.subject-detail', { subjectId });
  }

  async getAnalysisStatus(): Promise<DashboardActionResponse<{ isProcessing: boolean; lastRun?: string }>> {
    return this.read('analysis.status');
  }

  // ==========================================================================
  // SCORE HISTORY OPERATIONS (Feature 1, read-only)
  // ==========================================================================

  async getScoreHistory(
    subjectId: string,
    days: number = 30,
    limit: number = 100
  ): Promise<DashboardActionResponse<ScoreHistoryEntry[]>> {
    return this.read<ScoreHistoryEntry[]>('analytics.score-history', { subjectId, days, limit });
  }

  async getScoreTrends(scopeId: string): Promise<DashboardActionResponse<ScoreTrend[]>> {
    return this.read<ScoreTrend[]>('analytics.score-trends', { scopeId });
  }

  async getScopeScoreHistory(
    scopeId: string,
    days: number = 30
  ): Promise<DashboardActionResponse<{
    subjectId: string;
    subjectName: string;
    subjectIdentifier: string;
    scores: { score: number; confidence: number; change: number; createdAt: string }[];
  }[]>> {
    return this.read('analytics.scope-score-history', { scopeId, days });
  }

  // ==========================================================================
  // HEATMAP OPERATIONS (Feature 4, read-only)
  // ==========================================================================

  async getHeatmapData(
    scopeId: string,
    riskLevel?: 'critical' | 'high' | 'medium' | 'low'
  ): Promise<DashboardActionResponse<HeatmapData>> {
    return this.read<HeatmapData>('analytics.heatmap', { scopeId, riskLevel });
  }

  // ==========================================================================
  // PORTFOLIO AGGREGATE OPERATIONS (Feature 6, read-only)
  // ==========================================================================

  async getPortfolioAggregate(scopeId: string): Promise<DashboardActionResponse<PortfolioAggregate>> {
    return this.read<PortfolioAggregate>('analytics.portfolio-aggregate', { scopeId });
  }

  async getRiskDistribution(scopeId: string): Promise<DashboardActionResponse<RiskDistribution[]>> {
    return this.read<RiskDistribution[]>('analytics.risk-distribution', { scopeId });
  }

  async getDimensionContributions(scopeId: string): Promise<DashboardActionResponse<DimensionContribution[]>> {
    return this.read<DimensionContribution[]>('analytics.dimension-contributions', { scopeId });
  }

  // ==========================================================================
  // CORRELATION OPERATIONS (Feature 7, read-only)
  // ==========================================================================

  async getCorrelationMatrix(scopeId: string): Promise<DashboardActionResponse<CorrelationMatrix>> {
    return this.read<CorrelationMatrix>('correlations.analyze', { scopeId });
  }

  // ==========================================================================
  // SUBJECT COMPARISON OPERATIONS (Feature 2, read-only)
  // ==========================================================================

  async compareSubjects(subjectIds: string[]): Promise<DashboardActionResponse<SubjectComparison>> {
    return this.read<SubjectComparison>('analytics.compare-subjects', { subjectIds });
  }

  async listComparisons(scopeId: string): Promise<DashboardActionResponse<ComparisonSet[]>> {
    return this.read<ComparisonSet[]>('analytics.list-comparisons', { scopeId });
  }

  // ==========================================================================
  // EXECUTIVE SUMMARY OPERATIONS (Feature 5, read-only)
  // ==========================================================================

  async getLatestSummary(scopeId: string): Promise<DashboardActionResponse<ExecutiveSummary | null>> {
    return this.read<ExecutiveSummary | null>('advanced-analytics.get-latest-summary', { scopeId });
  }

  async listSummaries(params: {
    scopeId: string;
    limit?: number;
    summaryType?: string;
  }): Promise<DashboardActionResponse<ExecutiveSummary[]>> {
    return this.read<ExecutiveSummary[]>('advanced-analytics.list-summaries', params);
  }

  // ==========================================================================
  // SCENARIO ANALYSIS OPERATIONS (Feature 9, read-only)
  // ==========================================================================

  async listScenarios(params: {
    scopeId: string;
    includeTemplates?: boolean;
  }): Promise<DashboardActionResponse<Scenario[]>> {
    return this.read<Scenario[]>('advanced-analytics.list-scenarios', params);
  }

  async getScenario(id: string): Promise<DashboardActionResponse<Scenario>> {
    return this.read<Scenario>('advanced-analytics.get-scenario', { id });
  }

  async getScenarioTemplates(): Promise<DashboardActionResponse<Scenario[]>> {
    return this.read<Scenario[]>('advanced-analytics.get-scenario-templates');
  }

  async runScenario(params: {
    scopeId: string;
    name: string;
    adjustments: Array<{ dimensionSlug: string; adjustment: number }>;
  }): Promise<DashboardActionResponse<ScenarioResult>> {
    return this.read<ScenarioResult>('advanced-analytics.run-scenario', params);
  }

  // ==========================================================================
  // PDF REPORT OPERATIONS (Feature 8, read-only)
  // ==========================================================================

  async getReport(id: string): Promise<DashboardActionResponse<Report>> {
    return this.read<Report>('advanced-analytics.get-report', { id });
  }

  async listReports(params: {
    scopeId: string;
    limit?: number;
    status?: string;
  }): Promise<DashboardActionResponse<Report[]>> {
    return this.read<Report[]>('advanced-analytics.list-reports', params);
  }

  // ==========================================================================
  // MONTE CARLO SIMULATION OPERATIONS (Feature 10, read-only)
  // ==========================================================================

  async getSimulation(simulationId: string): Promise<DashboardActionResponse<Simulation>> {
    return this.read<Simulation>('simulations.get-simulation', { simulationId });
  }

  async listSimulations(params: {
    scopeId: string;
    subjectId?: string;
    status?: 'pending' | 'running' | 'completed' | 'failed';
    limit?: number;
    offset?: number;
  }): Promise<DashboardActionResponse<Simulation[]>> {
    return this.read<Simulation[]>('simulations.list-simulations', params);
  }

  async getDistributionTemplates(): Promise<DashboardActionResponse<Record<string, DimensionDistribution>>> {
    return this.read<Record<string, DimensionDistribution>>('simulations.get-distribution-templates');
  }

  // ==========================================================================
  // DATA SOURCE OPERATIONS (Feature 11, read-only)
  // ==========================================================================

  async getDataSource(dataSourceId: string): Promise<DashboardActionResponse<DataSource>> {
    return this.read<DataSource>('data-sources.get-source', { dataSourceId });
  }

  async listDataSources(params: {
    scopeId: string;
    status?: DataSourceStatus;
    sourceType?: DataSourceType;
    limit?: number;
    offset?: number;
  }): Promise<DashboardActionResponse<DataSource[]>> {
    return this.read<DataSource[]>('data-sources.list-sources', params);
  }

  async getFetchHistory(params: {
    dataSourceId: string;
    limit?: number;
  }): Promise<DashboardActionResponse<FetchHistoryRecord[]>> {
    return this.read<FetchHistoryRecord[]>('data-sources.get-fetch-history', params);
  }

  async getDataSourceHealthSummary(scopeId: string): Promise<DashboardActionResponse<DataSourceHealthSummary>> {
    return this.read<DataSourceHealthSummary>('data-sources.get-health-summary', { scopeId });
  }

  async getSourcesDueForFetch(): Promise<DashboardActionResponse<DataSource[]>> {
    return this.read<DataSource[]>('data-sources.get-due-sources');
  }
}

// Export singleton instance
export const riskDashboardService = new RiskDashboardService();
