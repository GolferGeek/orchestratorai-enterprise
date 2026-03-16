/**
 * Risk Dashboard Store - State + Synchronous Mutations Only
 *
 * Architecture: Stores contain ONLY state and synchronous mutations
 * For async operations, use riskDashboardService
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  RiskScope,
  RiskSubject,
  RiskDimension,
  RiskAssessment,
  ActiveCompositeScoreView,
  RiskDebate,
  RiskDebateContext,
  RiskAlert,
  UnacknowledgedAlertView,
  PendingLearningView,
  RiskEvaluation,
  DashboardViewMode,
  RiskDashboardFilters,
  DashboardStats,
  SelectedSubjectState,
  RadarChartDataPoint,
} from '@/types/risk-agent';

interface RiskDashboardState {
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

  // Debate contexts for the current scope
  debateContexts: RiskDebateContext[];

  // Alerts
  alerts: UnacknowledgedAlertView[];

  // Learnings
  pendingLearnings: PendingLearningView[];

  // UI state
  viewMode: DashboardViewMode;
  filters: RiskDashboardFilters;
  stats: DashboardStats;

  // Comparison feature
  comparisonSubjectIds: string[];

  // Loading states
  isLoading: boolean;
  isAnalyzing: boolean;
  error: string | null;
}

const initialStats: DashboardStats = {
  totalSubjects: 0,
  analyzedSubjects: 0,
  averageScore: 0,
  criticalAlerts: 0,
  warningAlerts: 0,
  pendingLearnings: 0,
  staleAssessments: 0,
};

export const useRiskDashboardStore = defineStore('riskDashboard', () => {
  // ============================================================================
  // STATE
  // ============================================================================

  const state = ref<RiskDashboardState>({
    currentScope: null,
    scopes: [],
    subjects: [],
    compositeScores: [],
    selectedSubject: null,
    dimensions: [],
    debateContexts: [],
    alerts: [],
    pendingLearnings: [],
    viewMode: 'radar',
    filters: {},
    stats: { ...initialStats },
    comparisonSubjectIds: [],
    isLoading: false,
    isAnalyzing: false,
    error: null,
  });

  // ============================================================================
  // COMPUTED / GETTERS
  // ============================================================================

  // Basic state getters
  const currentScope = computed(() => state.value.currentScope);
  const scopes = computed(() => state.value.scopes);
  const subjects = computed(() => state.value.subjects);
  const compositeScores = computed(() => state.value.compositeScores);
  const selectedSubject = computed(() => state.value.selectedSubject);
  const dimensions = computed(() => state.value.dimensions);
  const debateContexts = computed(() => state.value.debateContexts);
  const alerts = computed(() => state.value.alerts);
  const pendingLearnings = computed(() => state.value.pendingLearnings);
  const viewMode = computed(() => state.value.viewMode);
  const filters = computed(() => state.value.filters);
  const stats = computed(() => state.value.stats);
  const isLoading = computed(() => state.value.isLoading);
  const isAnalyzing = computed(() => state.value.isAnalyzing);
  const error = computed(() => state.value.error);
  const comparisonSubjectIds = computed(() => state.value.comparisonSubjectIds);

  // Derived state
  const activeSubjects = computed(() =>
    state.value.subjects.filter((s) => s.isActive)
  );

  const activeDimensions = computed(() =>
    state.value.dimensions.filter((d) => d.isActive)
  );

  const criticalAlerts = computed(() =>
    state.value.alerts.filter((a) => a.severity === 'critical')
  );

  const warningAlerts = computed(() =>
    state.value.alerts.filter((a) => a.severity === 'warning')
  );

  const hasUnacknowledgedAlerts = computed(() => state.value.alerts.length > 0);

  const hasPendingLearnings = computed(() => state.value.pendingLearnings.length > 0);

  const averageRiskScore = computed(() => {
    const scores = state.value.compositeScores;
    if (scores.length === 0) return 0;
    return scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
  });

  const highRiskSubjects = computed(() =>
    state.value.compositeScores.filter((s) => s.score >= 0.7)
  );

  const staleAssessments = computed(() =>
    state.value.compositeScores.filter((s) => s.ageHours > 168) // 7 days
  );

  // Radar chart data for selected subject
  const radarChartData = computed((): RadarChartDataPoint[] => {
    if (!state.value.selectedSubject?.compositeScore) return [];

    const dimensionScores = state.value.selectedSubject.compositeScore.dimensionScores;
    return Object.entries(dimensionScores).map(([slug, data]) => ({
      dimension: slug,
      score: data.score,
      confidence: data.confidence,
      weight: data.weight,
    }));
  });

  // Filtered subjects based on current filters
  const filteredSubjects = computed(() => {
    let filtered = state.value.subjects;
    const f = state.value.filters;

    if (f.scopeId) {
      filtered = filtered.filter((s) => s.scopeId === f.scopeId);
    }

    if (f.subjectType) {
      filtered = filtered.filter((s) => s.subjectType === f.subjectType);
    }

    return filtered;
  });

  // Filtered composite scores based on current filters
  const filteredCompositeScores = computed(() => {
    let filtered = state.value.compositeScores;
    const f = state.value.filters;

    if (f.minScore !== undefined) {
      filtered = filtered.filter((s) => s.score >= f.minScore!);
    }

    if (f.maxScore !== undefined) {
      filtered = filtered.filter((s) => s.score <= f.maxScore!);
    }

    if (f.hasAlerts) {
      const alertSubjectIds = new Set(state.value.alerts.map((a) => a.subjectId));
      filtered = filtered.filter((s) => alertSubjectIds.has(s.subjectId));
    }

    if (f.isStale) {
      filtered = filtered.filter((s) => s.ageHours > 168);
    }

    return filtered;
  });

  // ============================================================================
  // GETTERS (Functions)
  // ============================================================================

  function getScopeById(id: string): RiskScope | undefined {
    return state.value.scopes.find((s) => s.id === id);
  }

  function getSubjectById(id: string): RiskSubject | undefined {
    return state.value.subjects.find((s) => s.id === id);
  }

  function getDimensionById(id: string): RiskDimension | undefined {
    return state.value.dimensions.find((d) => d.id === id);
  }

  function getDimensionBySlug(slug: string): RiskDimension | undefined {
    return state.value.dimensions.find((d) => d.slug === slug);
  }

  function getCompositeScoreBySubjectId(subjectId: string): ActiveCompositeScoreView | undefined {
    return state.value.compositeScores.find((s) => s.subjectId === subjectId);
  }

  function getAlertsBySubjectId(subjectId: string): UnacknowledgedAlertView[] {
    return state.value.alerts.filter((a) => a.subjectId === subjectId);
  }

  function getDebateContextByRole(role: 'blue' | 'red' | 'arbiter'): RiskDebateContext | undefined {
    return state.value.debateContexts.find((c) => c.role === role && c.isActive);
  }

  // ============================================================================
  // MUTATIONS (Synchronous Only)
  // ============================================================================

  function setLoading(loading: boolean) {
    state.value.isLoading = loading;
  }

  function setAnalyzing(analyzing: boolean) {
    state.value.isAnalyzing = analyzing;
  }

  function setError(error: string | null) {
    state.value.error = error;
  }

  function clearError() {
    state.value.error = null;
  }

  function setCurrentScope(scope: RiskScope | null) {
    state.value.currentScope = scope;
  }

  function setScopes(scopes: RiskScope[]) {
    state.value.scopes = scopes;
  }

  function addScope(scope: RiskScope) {
    const existing = state.value.scopes.findIndex((s) => s.id === scope.id);
    if (existing >= 0) {
      state.value.scopes[existing] = scope;
    } else {
      state.value.scopes.push(scope);
    }
  }

  function updateScope(id: string, updates: Partial<RiskScope>) {
    const index = state.value.scopes.findIndex((s) => s.id === id);
    if (index >= 0) {
      state.value.scopes[index] = {
        ...state.value.scopes[index],
        ...updates,
      };
    }
    // Update currentScope if it's the same
    if (state.value.currentScope?.id === id) {
      state.value.currentScope = {
        ...state.value.currentScope,
        ...updates,
      };
    }
  }

  function removeScope(id: string) {
    state.value.scopes = state.value.scopes.filter((s) => s.id !== id);
    if (state.value.currentScope?.id === id) {
      state.value.currentScope = null;
    }
  }

  function setSubjects(subjects: RiskSubject[]) {
    // Transform snake_case API response to camelCase expected by frontend
    state.value.subjects = subjects.map((subject) => {
      const s = subject as unknown as Record<string, unknown>;
      return {
        ...subject,
        scopeId: (s.scope_id as string) || (s.scopeId as string) || '',
        subjectType: (s.subject_type as string) || (s.subjectType as string) || 'custom',
        isActive: s.is_active === true || s.isActive === true,
        createdAt: (s.created_at as string) || (s.createdAt as string) || '',
        updatedAt: (s.updated_at as string) || (s.updatedAt as string) || '',
        name: (s.name as string) || '',
      } as RiskSubject;
    });
  }

  function addSubject(subject: RiskSubject) {
    const existing = state.value.subjects.findIndex((s) => s.id === subject.id);
    if (existing >= 0) {
      state.value.subjects[existing] = subject;
    } else {
      state.value.subjects.push(subject);
    }
  }

  function updateSubject(id: string, updates: Partial<RiskSubject>) {
    const index = state.value.subjects.findIndex((s) => s.id === id);
    if (index >= 0) {
      state.value.subjects[index] = {
        ...state.value.subjects[index],
        ...updates,
      };
    }
  }

  function removeSubject(id: string) {
    state.value.subjects = state.value.subjects.filter((s) => s.id !== id);
  }

  function setDimensions(dimensions: RiskDimension[]) {
    // Transform snake_case API response to camelCase expected by frontend
    state.value.dimensions = dimensions.map((dimension) => {
      const d = dimension as unknown as Record<string, unknown>;
      return {
        ...dimension,
        scopeId: (d.scope_id as string) || (d.scopeId as string) || '',
        displayName: (d.display_name as string) || (d.displayName as string) || undefined,
        displayOrder: typeof d.display_order === 'number' ? d.display_order : (typeof d.displayOrder === 'number' ? d.displayOrder : undefined),
        isActive: d.is_active === true || d.isActive === true,
        createdAt: (d.created_at as string) || (d.createdAt as string) || '',
        updatedAt: (d.updated_at as string) || (d.updatedAt as string) || '',
      } as RiskDimension;
    });
  }

  function addDimension(dimension: RiskDimension) {
    const existing = state.value.dimensions.findIndex((d) => d.id === dimension.id);
    if (existing >= 0) {
      state.value.dimensions[existing] = dimension;
    } else {
      state.value.dimensions.push(dimension);
    }
  }

  function updateDimension(id: string, updates: Partial<RiskDimension>) {
    const index = state.value.dimensions.findIndex((d) => d.id === id);
    if (index >= 0) {
      state.value.dimensions[index] = {
        ...state.value.dimensions[index],
        ...updates,
      };
    }
  }

  function removeDimension(id: string) {
    state.value.dimensions = state.value.dimensions.filter((d) => d.id !== id);
  }

  function setDebateContexts(contexts: RiskDebateContext[]) {
    // Transform snake_case API response to camelCase expected by frontend
    state.value.debateContexts = contexts.map((context) => {
      const c = context as unknown as Record<string, unknown>;
      return {
        ...context,
        scopeId: (c.scope_id as string) || (c.scopeId as string) || '',
        systemPrompt: (c.system_prompt as string) || (c.systemPrompt as string) || '',
        outputSchema: (c.output_schema as Record<string, unknown>) || (c.outputSchema as Record<string, unknown>) || undefined,
        isActive: c.is_active === true || c.isActive === true,
        createdAt: (c.created_at as string) || (c.createdAt as string) || '',
        updatedAt: (c.updated_at as string) || (c.updatedAt as string) || '',
      } as RiskDebateContext;
    });
  }

  function addDebateContext(context: RiskDebateContext) {
    // Transform if needed
    const c = context as unknown as Record<string, unknown>;
    const transformed = {
      ...context,
      scopeId: (c.scope_id as string) || (c.scopeId as string) || context.scopeId || '',
      systemPrompt: (c.system_prompt as string) || (c.systemPrompt as string) || context.systemPrompt || '',
      outputSchema: (c.output_schema as Record<string, unknown>) || (c.outputSchema as Record<string, unknown>) || context.outputSchema,
      isActive: c.is_active === true || c.isActive === true || context.isActive === true,
      createdAt: (c.created_at as string) || (c.createdAt as string) || context.createdAt || '',
      updatedAt: (c.updated_at as string) || (c.updatedAt as string) || context.updatedAt || '',
    } as RiskDebateContext;

    const existing = state.value.debateContexts.findIndex((ctx) => ctx.id === context.id);
    if (existing >= 0) {
      state.value.debateContexts[existing] = transformed;
    } else {
      state.value.debateContexts.push(transformed);
    }
  }

  function updateDebateContextInStore(id: string, updates: Partial<RiskDebateContext>) {
    const index = state.value.debateContexts.findIndex((c) => c.id === id);
    if (index >= 0) {
      state.value.debateContexts[index] = {
        ...state.value.debateContexts[index],
        ...updates,
      };
    }
  }

  function removeDebateContext(id: string) {
    state.value.debateContexts = state.value.debateContexts.filter((c) => c.id !== id);
  }

  // Helper to normalize scores to 0-1 scale
  // Handles multiple scales: 0-1 (already normalized), 1-10 (dimension scores), 0-100 (percentages)
  function normalizeScore(score: number): number {
    // Guard against undefined, null, or NaN
    if (score === undefined || score === null || Number.isNaN(score)) return 0;
    if (score <= 1) return score; // Already 0-1 scale
    if (score <= 10) return score / 10; // 1-10 scale (dimension assessments)
    return score / 100; // 0-100 scale (percentages)
  }

  // Helper to transform dimension scores to 0-1 scale
  // Handles both simple number format {credit: 50} and object format {credit: {score: 50, confidence: 0.8}}
  function transformDimensionScores(dimensionScores: Record<string, unknown>): Record<string, { score: number; confidence: number; weight: number; assessmentId: string }> {
    const result: Record<string, { score: number; confidence: number; weight: number; assessmentId: string }> = {};
    for (const [slug, data] of Object.entries(dimensionScores)) {
      // Handle simple number format: {credit: 50, momentum: 50}
      if (typeof data === 'number') {
        result[slug] = {
          score: normalizeScore(data),
          confidence: 0,
          weight: 1,
          assessmentId: '',
        };
      }
      // Handle object format: {credit: {score: 50, confidence: 0.8, weight: 1, assessmentId: 'xxx'}}
      else if (data && typeof data === 'object' && !Array.isArray(data)) {
        const d = data as Record<string, unknown>;
        const rawScore = typeof d.score === 'number' ? d.score : 0;
        const rawConfidence = typeof d.confidence === 'number' ? d.confidence : 0;
        result[slug] = {
          // Normalize score using proper scale detection
          score: normalizeScore(rawScore),
          confidence: normalizeScore(rawConfidence),
          weight: typeof d.weight === 'number' ? d.weight : 1,
          assessmentId: (d.assessmentId as string) || (d.assessment_id as string) || '',
        };
      }
    }
    return result;
  }

  function setCompositeScores(scores: ActiveCompositeScoreView[]) {
    console.log('[STORE] setCompositeScores called with', scores.length, 'scores');
    if (scores.length > 0) {
      console.log('[STORE] First raw score:', JSON.stringify(scores[0], null, 2));
    }
    // Transform snake_case API response to camelCase expected by frontend
    state.value.compositeScores = scores.map((score) => {
      const s = score as unknown as Record<string, unknown>;
      const createdAt = s.created_at as string || s.createdAt as string || '';
      // Calculate ageHours from created_at timestamp
      const ageHours = createdAt 
        ? Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60))
        : (typeof s.age_hours === 'number' ? s.age_hours : (typeof s.ageHours === 'number' ? s.ageHours : 0));
      
      // Extract subjectId - this is critical for subject selection
      // Must extract BEFORE spreading to avoid overwriting
      const subjectId = (s.subject_id as string) || (s.subjectId as string) || '';
      
      if (!subjectId) {
        console.warn('setCompositeScores: No subjectId found in score:', score.id, 'keys:', Object.keys(s));
      }
      
      // Create transformed object - subjectId MUST come after spread to override any undefined value
      return {
        ...score,
        // Map overall_score (0-100) to score (0-1) for frontend
        score: typeof s.overall_score === 'number' 
          ? s.overall_score / 100 
          : (typeof s.score === 'number' ? s.score : 0),
        // CRITICAL: Ensure subjectId is set (used for subject selection) - must come after spread
        subjectId: subjectId || (s.id as string) || '', // Fallback to score.id if subjectId missing
        subjectIdentifier: (s.subject_identifier as string) || (s.subjectIdentifier as string) || '',
        subjectName: (s.subject_name as string) || (s.subjectName as string) || '',
        subjectType: (s.subject_type as string) || (s.subjectType as string) || '',
        taskId: (s.task_id as string) || (s.taskId as string) || '',
        dimensionScores: transformDimensionScores((s.dimension_scores as Record<string, unknown>) || s.dimensionScores || {}),
        debateId: (s.debate_id as string) || (s.debateId as string) || undefined,
        debateAdjustment: (s.debate_adjustment as number) || (s.debateAdjustment as number) || undefined,
        createdAt,
        isSuperseded: s.status === 'superseded' || s.isSuperseded === true,
        ageHours,
      } as ActiveCompositeScoreView;
    });
    if (state.value.compositeScores.length > 0) {
      console.log('[STORE] First transformed score:', JSON.stringify(state.value.compositeScores[0], null, 2));
    }
  }

  function addCompositeScore(score: ActiveCompositeScoreView) {
    const existing = state.value.compositeScores.findIndex((s) => s.id === score.id);
    if (existing >= 0) {
      state.value.compositeScores[existing] = score;
    } else {
      state.value.compositeScores.push(score);
    }
  }

  function updateCompositeScore(id: string, updates: Partial<ActiveCompositeScoreView>) {
    const index = state.value.compositeScores.findIndex((s) => s.id === id);
    if (index >= 0) {
      state.value.compositeScores[index] = {
        ...state.value.compositeScores[index],
        ...updates,
      };
    }
  }

  function setAlerts(alerts: UnacknowledgedAlertView[]) {
    // Transform snake_case API response to camelCase expected by frontend
    state.value.alerts = alerts.map((alert) => {
      const a = alert as unknown as Record<string, unknown>;
      return {
        ...alert,
        subjectId: (a.subject_id as string) || (a.subjectId as string) || '',
        compositeScoreId: (a.composite_score_id as string) || (a.compositeScoreId as string) || '',
        subjectName: (a.subject_name as string) || (a.subjectName as string) || '',
        subjectIdentifier: (a.subject_identifier as string) || (a.subjectIdentifier as string) || '',
        acknowledgedAt: (a.acknowledged_at as string) || (a.acknowledgedAt as string) || undefined,
        acknowledgedBy: (a.acknowledged_by as string) || (a.acknowledgedBy as string) || undefined,
        createdAt: (a.created_at as string) || (a.createdAt as string) || '',
      } as UnacknowledgedAlertView;
    });
  }

  function addAlert(alert: UnacknowledgedAlertView) {
    const existing = state.value.alerts.findIndex((a) => a.id === alert.id);
    if (existing >= 0) {
      state.value.alerts[existing] = alert;
    } else {
      state.value.alerts.push(alert);
    }
  }

  function removeAlert(id: string) {
    state.value.alerts = state.value.alerts.filter((a) => a.id !== id);
  }

  function setPendingLearnings(learnings: PendingLearningView[]) {
    // Transform snake_case API response to camelCase expected by frontend
    state.value.pendingLearnings = learnings.map((learning) => {
      const l = learning as unknown as Record<string, unknown>;
      return {
        ...learning,
        scopeId: (l.scope_id as string) || (l.scopeId as string) || '',
        subjectId: (l.subject_id as string) || (l.subjectId as string) || undefined,
        dimensionId: (l.dimension_id as string) || (l.dimensionId as string) || undefined,
        subjectName: (l.subject_name as string) || (l.subjectName as string) || '',
        subjectIdentifier: (l.subject_identifier as string) || (l.subjectIdentifier as string) || '',
        scopeName: (l.scope_name as string) || (l.scopeName as string) || '',
        createdAt: (l.created_at as string) || (l.createdAt as string) || '',
        updatedAt: (l.updated_at as string) || (l.updatedAt as string) || '',
      } as PendingLearningView;
    });
  }

  function addPendingLearning(learning: PendingLearningView) {
    const existing = state.value.pendingLearnings.findIndex((l) => l.id === learning.id);
    if (existing >= 0) {
      state.value.pendingLearnings[existing] = learning;
    } else {
      state.value.pendingLearnings.push(learning);
    }
  }

  function removePendingLearning(id: string) {
    state.value.pendingLearnings = state.value.pendingLearnings.filter((l) => l.id !== id);
  }

  function setSelectedSubject(selected: SelectedSubjectState | null) {
    state.value.selectedSubject = selected;
  }

  function updateSelectedSubjectAssessments(assessments: RiskAssessment[]) {
    if (state.value.selectedSubject) {
      state.value.selectedSubject = {
        ...state.value.selectedSubject,
        assessments,
      };
    }
  }

  function updateSelectedSubjectDebate(debate: RiskDebate | null) {
    if (state.value.selectedSubject) {
      state.value.selectedSubject = {
        ...state.value.selectedSubject,
        debate,
      };
    }
  }

  function updateSelectedSubjectAlerts(alerts: RiskAlert[]) {
    if (state.value.selectedSubject) {
      state.value.selectedSubject = {
        ...state.value.selectedSubject,
        alerts,
      };
    }
  }

  function updateSelectedSubjectEvaluations(evaluations: RiskEvaluation[]) {
    if (state.value.selectedSubject) {
      state.value.selectedSubject = {
        ...state.value.selectedSubject,
        evaluations,
      };
    }
  }

  function setViewMode(mode: DashboardViewMode) {
    state.value.viewMode = mode;
  }

  function setFilters(filters: RiskDashboardFilters) {
    state.value.filters = filters;
  }

  function updateFilters(updates: Partial<RiskDashboardFilters>) {
    state.value.filters = {
      ...state.value.filters,
      ...updates,
    };
  }

  function clearFilters() {
    state.value.filters = {};
  }

  function setStats(stats: DashboardStats | Record<string, unknown>) {
    // Transform API response (may have snake_case or camelCase) to expected format
    const s = stats as Record<string, unknown>;
    state.value.stats = {
      totalSubjects: Number(s.totalSubjects ?? s.total_subjects ?? 0) || 0,
      analyzedSubjects: Number(s.analyzedSubjects ?? s.analyzed_subjects ?? 0) || 0,
      averageScore: Number(s.averageScore ?? s.average_score ?? 0) || 0,
      criticalAlerts: Number(s.criticalAlerts ?? s.critical_alerts ?? 0) || 0,
      warningAlerts: Number(s.warningAlerts ?? s.warning_alerts ?? 0) || 0,
      pendingLearnings: Number(s.pendingLearnings ?? s.pending_learnings ?? 0) || 0,
      staleAssessments: Number(s.staleAssessments ?? s.stale_assessments ?? 0) || 0,
    };
  }

  function updateStats(updates: Partial<DashboardStats>) {
    state.value.stats = {
      ...state.value.stats,
      ...updates,
    };
  }

  function resetState() {
    state.value.currentScope = null;
    state.value.scopes = [];
    state.value.subjects = [];
    state.value.compositeScores = [];
    state.value.selectedSubject = null;
    state.value.dimensions = [];
    state.value.debateContexts = [];
    state.value.alerts = [];
    state.value.pendingLearnings = [];
    state.value.viewMode = 'radar';
    state.value.filters = {};
    state.value.stats = { ...initialStats };
    state.value.comparisonSubjectIds = [];
    state.value.isLoading = false;
    state.value.isAnalyzing = false;
    state.value.error = null;
  }

  // Comparison mutations
  function addToComparison(subjectId: string) {
    if (!state.value.comparisonSubjectIds.includes(subjectId)) {
      state.value.comparisonSubjectIds.push(subjectId);
    }
  }

  function removeFromComparison(subjectId: string) {
    state.value.comparisonSubjectIds = state.value.comparisonSubjectIds.filter(id => id !== subjectId);
  }

  function clearComparison() {
    state.value.comparisonSubjectIds = [];
  }

  // ============================================================================
  // RETURN (Public API)
  // ============================================================================

  return {
    // State (computed)
    currentScope,
    scopes,
    subjects,
    compositeScores,
    selectedSubject,
    dimensions,
    debateContexts,
    alerts,
    pendingLearnings,
    viewMode,
    filters,
    stats,
    isLoading,
    isAnalyzing,
    error,
    comparisonSubjectIds,

    // Derived state
    activeSubjects,
    activeDimensions,
    criticalAlerts,
    warningAlerts,
    hasUnacknowledgedAlerts,
    hasPendingLearnings,
    averageRiskScore,
    highRiskSubjects,
    staleAssessments,
    radarChartData,
    filteredSubjects,
    filteredCompositeScores,

    // Getters (functions)
    getScopeById,
    getSubjectById,
    getDimensionById,
    getDimensionBySlug,
    getCompositeScoreBySubjectId,
    getAlertsBySubjectId,
    getDebateContextByRole,

    // Mutations
    setLoading,
    setAnalyzing,
    setError,
    clearError,
    setCurrentScope,
    setScopes,
    addScope,
    updateScope,
    removeScope,
    setSubjects,
    addSubject,
    updateSubject,
    removeSubject,
    setDimensions,
    addDimension,
    updateDimension,
    removeDimension,
    setDebateContexts,
    addDebateContext,
    updateDebateContextInStore,
    removeDebateContext,
    setCompositeScores,
    addCompositeScore,
    updateCompositeScore,
    setAlerts,
    addAlert,
    removeAlert,
    setPendingLearnings,
    addPendingLearning,
    removePendingLearning,
    setSelectedSubject,
    updateSelectedSubjectAssessments,
    updateSelectedSubjectDebate,
    updateSelectedSubjectAlerts,
    updateSelectedSubjectEvaluations,
    setViewMode,
    setFilters,
    updateFilters,
    clearFilters,
    setStats,
    updateStats,
    resetState,
    addToComparison,
    removeFromComparison,
    clearComparison,
  };
});
