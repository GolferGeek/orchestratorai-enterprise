// Analytics and Reporting Types
// Based on backend analytics endpoints and evaluation services

import type { JsonValue } from '@orchestrator-ai/transport-types';

// Re-define UnknownRecord locally to avoid circular dependency
export type UnknownRecord = Record<string, JsonValue>;

// =====================================
// BASIC ANALYTICS TYPES
// =====================================

export interface TimeRange {
  startDate: string;
  endDate: string;
}

export interface AnalyticsFilters {
  timeRange?: TimeRange;
  userId?: string;
  userRole?: string;
  providerName?: string;
  modelName?: string;
  taskId?: string;
  status?: string;
  granularity?: 'daily' | 'weekly' | 'monthly';
  includeDetails?: boolean;
}

export interface MetricTrend {
  date: string;
  value: number;
  change?: number;
  changePercentage?: number;
}

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  changePercentage: number;
  benchmark?: number;
  status: 'good' | 'warning' | 'critical';
}

// =====================================
// EVALUATION ANALYTICS
// =====================================

export interface EvaluationAnalytics {
  totalEvaluations: number;
  averageRating: number;
  ratingDistribution: Record<string, number>;
  responseTimeAnalysis: {
    averageResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    responseTimeDistribution: { range: string; count: number }[];
  };
  costAnalysis: {
    totalCost: number;
    averageCostPerRequest: number;
    costTrends: MetricTrend[];
    costByProvider: Record<string, number>;
  };
  userSatisfactionMetrics: {
    averageUserRating: number;
    averageSpeedRating: number;
    averageAccuracyRating: number;
    satisfactionTrends: MetricTrend[];
  };
  modelPerformanceComparison: Array<{
    modelName: string;
    averageRating: number;
    responseTime: number;
    cost: number;
    usageCount: number;
    rank: number;
  }>;
  workflowFailurePoints: Array<{
    stepName: string;
    failureRate: number;
    averageRecoveryTime: number;
    commonErrors: string[];
  }>;
}

export interface WorkflowAnalytics {
  totalWorkflowsExecuted?: number;
  averageCompletionRate?: number;
  averageExecutionTime?: number;
  averageStepsCompleted?: number;
  stepPerformance?: Array<{
    stepName: string;
    averageDuration: number;
    successRate: number;
    failureRate: number;
    totalExecutions: number;
    executionCount: number;
  }>;
  commonFailures?: Array<{
    stepName: string;
    failureCount: number;
    totalAttempts: number;
    failureRate: number;
    commonError: string;
  }>;
  durationDistribution?: Array<{
    range: string;
    count: number;
  }>;
  agentPerformance?: Array<{
    agentName: string;
    workflowCount: number;
    successRate: number;
    averageDuration: number;
  }>;
  recentActivity?: Array<{
    workflowId: string;
    agentName: string;
    stepName?: string;
    timestamp: string;
    status: 'completed' | 'failed' | 'partial';
  }>;
  workflowPerformance?: Array<{
    stepName: string;
    averageDuration: number;
    successRate: number;
    failureRate: number;
    totalExecutions: number;
  }>;
  commonFailurePatterns: Array<{
    pattern: string;
    occurrences: number;
    impactRating: number;
    stepName?: string;
    failureRate?: number;
    failureCount?: number;
    totalAttempts?: number;
    commonError?: string;
  }>;
  workflowEfficiencyTrends?: Array<{
    date: string;
    averageSteps: number;
    averageDuration: number;
    successRate: number;
  }>;
}

export interface ConstraintAnalytics {
  constraintUsage: Array<{
    constraintName: string;
    usageCount: number;
    averageEffectiveness: number;
    userSatisfaction: number;
  }>;
  constraintCombinations: Array<{
    combination: string[];
    usageCount: number;
    effectivenessScore: number;
    averageRating: number;
  }>;
  constraintImpactOnPerformance: Array<{
    constraintName: string;
    withConstraint: {
      averageRating: number;
      averageResponseTime: number;
      averageCost: number;
    };
    withoutConstraint: {
      averageRating: number;
      averageResponseTime: number;
      averageCost: number;
    };
  }>;
}

// =====================================
// USAGE ANALYTICS
// =====================================

export interface UsageStats {
  userId: string;
  dateRange: TimeRange;
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  averageResponseTime: number;
  successRate: number;
  byProvider: Record<string, {
    requests: number;
    tokens: number;
    cost: number;
    averageResponseTime: number;
  }>;
  byModel: Record<string, {
    requests: number;
    tokens: number;
    cost: number;
    averageResponseTime: number;
  }>;
  byDataClassification?: Record<string, {
    requests: number;
    tokens: number;
    cost: number;
  }>;
}

export interface CostSummary {
  totalCost: number;
  totalTokens: number;
  totalRequests: number;
  period: TimeRange;
  breakdown: Array<{
    key: string;
    cost: number;
    tokens: number;
    requests: number;
    percentage: number;
  }>;
  trends: Array<{
    date: string;
    cost: number;
    tokens: number;
    requests: number;
  }>;
}

export interface ModelPerformance {
  model: UnknownRecord;
  metrics: {
    usageCount: number;
    avgUserRating: number;
    avgSpeedRating: number;
    avgAccuracyRating: number;
    avgResponseTimeMs: number;
    avgCostPerRequest: number;
    totalCost: number;
    totalTokens: number;
    costEfficiencyScore: number;
    performanceScore: number;
  };
  rank: number;
}

// =====================================
// TASK ANALYTICS
// =====================================

export interface TaskMetrics {
  requestCount: number;
  errorCount: number;
  averageResponseTime: number;
  activeTasks: number;
  completedTasks: number;
  uptime: number;
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  timestamp: Date;
}

export interface TaskAnalytics {
  totalTasks: number;
  tasksByStatus: Record<string, number>;
  averageTaskDuration: number;
  taskCompletionRate: number;
  taskFailureRate: number;
  taskTrends: MetricTrend[];
  topFailureReasons: Array<{
    reason: string;
    count: number;
    percentage: number;
  }>;
  performanceMetrics: {
    averageResponseTime: number;
    p95ResponseTime: number;
    throughput: number;
    errorRate: number;
  };
}

// =====================================
// SYSTEM ANALYTICS
// =====================================

export interface SystemAnalytics {
  systemHealth: {
    status: 'healthy' | 'warning' | 'critical';
    uptime: number;
    lastHealthCheck: string;
    issues: Array<{
      severity: 'low' | 'medium' | 'high' | 'critical';
      message: string;
      timestamp: string;
    }>;
  };
  resourceUtilization: {
    cpu: number;
    memory: number;
    disk: number;
    network: number;
  };
  serviceStatus: Array<{
    serviceName: string;
    status: 'running' | 'stopped' | 'error';
    responseTime: number;
    lastCheck: string;
  }>;
  errorRates: Array<{
    service: string;
    errorRate: number;
    errorCount: number;
    trend: 'up' | 'down' | 'stable';
  }>;
}

// =====================================
// BUSINESS ANALYTICS
// =====================================

export interface BusinessMetrics {
  userEngagement: {
    totalUsers: number;
    activeUsers: number;
    newUsers: number;
    userRetention: number;
    sessionDuration: number;
    userActivityTrends: MetricTrend[];
  };
  featureUsage: Array<{
    featureName: string;
    usageCount: number;
    uniqueUsers: number;
    averageSessionTime: number;
    adoptionRate: number;
  }>;
  conversionMetrics: {
    trialToCustomer: number;
    freeToTrial: number;
    customerChurn: number;
    revenuePerUser: number;
  };
  satisfactionScores: {
    nps: number;
    csat: number;
    ces: number;
    feedbackCount: number;
  };
}

// =====================================
// DASHBOARD ANALYTICS
// =====================================

export interface DashboardData {
  overview: {
    totalUsers: number;
    totalTasks: number;
    totalCost: number;
    systemHealth: 'healthy' | 'warning' | 'critical';
    activeAlerts: number;
  };
  keyMetrics: PerformanceMetric[];
  recentActivity: Array<{
    id: string;
    type: 'task' | 'evaluation' | 'alert';
    title: string;
    description: string;
    timestamp: string;
    status: string;
    userId?: string;
  }>;
  trends: {
    userGrowth: MetricTrend[];
    costTrends: MetricTrend[];
    performanceTrends: MetricTrend[];
    errorRates: MetricTrend[];
  };
  topPerformers: {
    models: ModelPerformance[];
    users: Array<{
      userId: string;
      username: string;
      activityScore: number;
      averageRating: number;
    }>;
  };
}

// =====================================
// REAL-TIME ANALYTICS
// =====================================

export interface RealTimeAnalytics {
  currentStats: {
    activeUsers: number;
    runningTasks: number;
    requestsPerMinute: number;
    averageResponseTime: number;
    errorRate: number;
    systemLoad: number;
  };
  liveMetrics: Array<{
    timestamp: string;
    metric: string;
    value: number;
    unit: string;
  }>;
  recentEvents: Array<{
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    timestamp: string;
    details?: UnknownRecord;
  }>;
  alerts: Array<{
    id: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    timestamp: string;
    acknowledged: boolean;
  }>;
}

// =====================================
// REPORTING TYPES
// =====================================

export interface ReportConfig {
  id: string;
  name: string;
  description: string;
  type: 'usage' | 'performance' | 'cost' | 'evaluation' | 'custom';
  filters: AnalyticsFilters;
  metrics: string[];
  visualizations: VisualizationConfig[];
  schedule?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    recipients: string[];
    format: 'pdf' | 'excel' | 'json';
  };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedReport {
  id: string;
  configId: string;
  name: string;
  generatedAt: string;
  period: TimeRange;
  data: JsonValue;
  fileUrl?: string;
  status: 'generating' | 'completed' | 'failed';
  error?: string;
}

// =====================================
// EVENT TRACKING
// =====================================

export interface AnalyticsEvent {
  id: string;
  eventType: string;
  category: string;
  action: string;
  label?: string;
  value?: number;
  userId?: string;
  sessionId?: string;
  timestamp: string;
  properties: UnknownRecord;
  context: {
    userAgent?: string;
    ip?: string;
    referrer?: string;
    url?: string;
  };
}

export interface EventTrackingConfig {
  trackPageViews: boolean;
  trackUserActions: boolean;
  trackPerformance: boolean;
  trackErrors: boolean;
  customEvents: string[];
  samplingRate: number;
  bufferSize: number;
  flushInterval: number;
}

// =====================================
// API REQUEST/RESPONSE TYPES
// =====================================

export interface AnalyticsRequest {
  filters: AnalyticsFilters;
  metrics?: string[];
  groupBy?: string[];
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
}

export interface AnalyticsResponse<T = UnknownRecord> {
  success: boolean;
  data: T;
  metadata: {
    totalRecords: number;
    filteredRecords: number;
    processingTime: number;
    cacheHit: boolean;
    generatedAt: string;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EvaluationAnalyticsResponse extends AnalyticsResponse<EvaluationAnalytics> {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface WorkflowAnalyticsResponse extends AnalyticsResponse<WorkflowAnalytics> {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface UsageStatsResponse extends AnalyticsResponse<UsageStats> {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface CostSummaryResponse extends AnalyticsResponse<CostSummary> {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ModelPerformanceResponse extends AnalyticsResponse<ModelPerformance[]> {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TaskAnalyticsResponse extends AnalyticsResponse<TaskAnalytics> {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SystemAnalyticsResponse extends AnalyticsResponse<SystemAnalytics> {}
export type BusinessMetricsResponse = AnalyticsResponse<BusinessMetrics>;
export type DashboardDataResponse = AnalyticsResponse<DashboardData>;
export type RealTimeAnalyticsResponse = AnalyticsResponse<RealTimeAnalytics>;

// =====================================
// FILTER AND SORT OPTIONS
// =====================================

export interface AnalyticsFiltersUI {
  timeRange?: 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thisMonth' | 'lastMonth' | 'custom';
  customTimeRange?: TimeRange;
  userRole?: string | 'all';
  provider?: string | 'all';
  model?: string | 'all';
  status?: string | 'all';
  granularity?: 'daily' | 'weekly' | 'monthly';
  includeDetails?: boolean;
  search?: string;
}

export interface AnalyticsSortOptions {
  field: string;
  direction: 'asc' | 'desc';
}

// =====================================
// CHART AND VISUALIZATION TYPES
// =====================================

export interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
    fill?: boolean;
    tension?: number;
  }>;
}

export interface ChartTooltipCallbacks {
  label?(context: unknown): unknown;
  title?(...context: unknown[]): unknown;
  [key: string]: ((...args: unknown[]) => unknown) | undefined;
}

export interface ChartScaleOptions {
  type?: string;
  display?: boolean;
  stacked?: boolean;
  min?: number;
  max?: number;
  title?: {
    display?: boolean;
    text?: string;
  };
  grid?: {
    display?: boolean;
  };
  ticks?: UnknownRecord;
}

export type ChartScales = Record<string, ChartScaleOptions>;

export interface ChartOptions {
  responsive: boolean;
  maintainAspectRatio: boolean;
  plugins: {
    title: {
      display: boolean;
      text: string;
    };
    legend: {
      display: boolean;
      position: 'top' | 'bottom' | 'left' | 'right';
    };
    tooltip: {
      enabled: boolean;
      callbacks?: ChartTooltipCallbacks;
    };
  };
  scales?: ChartScales;
}

export interface VisualizationConfig {
  type: 'line' | 'bar' | 'pie' | 'doughnut' | 'area' | 'scatter';
  data: ChartData;
  options: ChartOptions;
  height?: number;
  width?: number;
}

// =====================================
// EXPORT AND SHARING
// =====================================

export interface ExportConfig {
  format: 'pdf' | 'excel' | 'csv' | 'json' | 'png' | 'svg';
  includeCharts: boolean;
  includeRawData: boolean;
  dateRange: TimeRange;
  filters: AnalyticsFilters;
  sections: string[];
}

export interface ShareConfig {
  type: 'link' | 'email' | 'embed';
  permissions: 'view' | 'edit' | 'admin';
  expiresAt?: string;
  password?: string;
  recipients?: string[];
  message?: string;
}
