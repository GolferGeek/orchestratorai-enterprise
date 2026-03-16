// LLM Monitoring and Usage Tracking Types
// Based on backend monitoring services and usage analytics

import type { JsonValue } from '@orchestrator-ai/transport-types';

// Re-define UnknownRecord locally to avoid circular dependency
type UnknownRecord = Record<string, JsonValue>;

// =====================================
// BASIC LLM MONITORING TYPES
// =====================================

export interface LLMUsageMetrics {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  responseTime: number; // milliseconds
  provider: string;
  model: string;
  timestamp: string;
}

export interface LLMUsageRecord {
  id: string;
  userId: string | null;
  taskId?: string;
  sessionId?: string;
  callerType?: string;
  callerName?: string;
  dataClassification?: 'public' | 'internal' | 'confidential' | 'restricted';
  metrics: LLMUsageMetrics;
  createdAt: string;
  completedAt?: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  errorMessage?: string;
}

export interface LLMUsageStats {
  userId: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
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
  byDataClassification: Record<string, {
    requests: number;
    tokens: number;
    cost: number;
  }>;
}

// =====================================
// SYSTEM HEALTH & MONITORING
// =====================================

export interface ModelHealthMetrics {
  modelName: string;
  tier: string;
  isAvailable: boolean;
  averageResponseTime: number;
  errorRate: number;
  consecutiveFailures: number;
  lastSuccessfulCheck: string;
  lastErrorMessage?: string;
  checksPerformed: number;
  totalErrors: number;
}

export interface SystemHealthMetrics {
  ollamaConnected: boolean;
  totalModels: number;
  healthyModels: number;
  unhealthyModels: number;
  averageResponseTime: number;
  systemLoad: number;
  uptime: number;
  memoryStats: {
    memoryPressure: 'low' | 'medium' | 'high' | 'critical';
    currentUsage: number;
    totalAllocated: number;
    loadedModels: number;
    threeTierModels: number;
  };
}

export interface Alert {
  id: string;
  type: 'response_time' | 'error_rate' | 'memory_usage' | 'model_unavailable' | 'system_health';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details?: UnknownRecord;
  timestamp: string;
  resolved: boolean;
  resolvedAt?: string;
  modelName?: string;
}

export interface MonitoringStatus {
  isMonitoring: boolean;
  alertsActive: number;
  alertsTotal: number;
  modelsMonitored: number;
  uptime: number;
}

// =====================================
// PERFORMANCE & ANALYTICS
// =====================================

export interface PerformanceMetrics {
  provider: string;
  model: string;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  successRate: number;
  errorRate: number;
  totalRequests: number;
  costPerRequest: number;
  tokensPerSecond: number;
  period: {
    startDate: string;
    endDate: string;
  };
}

export interface CostAnalysis {
  totalCost: number;
  costByProvider: Record<string, number>;
  costByModel: Record<string, number>;
  costByDataClassification: Record<string, number>;
  costTrends: {
    date: string;
    cost: number;
    requests: number;
    tokens: number;
  }[];
  projectedMonthlyCost: number;
  costOptimizationSuggestions: string[];
}

export interface ComplianceMetrics {
  dataClassificationBreakdown: Record<string, {
    requests: number;
    percentage: number;
    averageResponseTime: number;
    errorRate: number;
  }>;
  piiDetectionStats: {
    totalScanned: number;
    piiDetected: number;
    sanitizationRate: number;
    byDataType: Record<string, number>;
  };
  auditTrail: {
    totalEvents: number;
    byEventType: Record<string, number>;
    recentEvents: {
      timestamp: string;
      event: string;
      details: UnknownRecord;
    }[];
  };
  complianceScore: number; // 0-100
  violations: {
    id: string;
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    timestamp: string;
    resolved: boolean;
  }[];
}

// =====================================
// OPERATIONAL STATUS
// =====================================

export interface OperationalStatus {
  timestamp: string;
  system: {
    healthy: boolean;
    ollamaConnected: boolean;
    modelsTotal: number;
    modelsHealthy: number;
    modelsUnhealthy: number;
    averageResponseTime: number;
    uptime: number;
  };
  memory: {
    healthy: boolean;
    pressure: 'low' | 'medium' | 'high' | 'critical';
    usagePercent: number;
    currentUsageGB: number;
    totalAllocatedGB: number;
    loadedModels: number;
    threeTierModels: number;
  };
  monitoring: {
    active: boolean;
    activeAlerts: number;
    totalAlerts: number;
    modelsMonitored: number;
    uptime: number;
  };
  loadedModels: string[];
  activeAlerts: Alert[];
}

// =====================================
// API REQUEST/RESPONSE TYPES
// =====================================

export interface LLMUsageStatsRequest {
  startDate?: string;
  endDate?: string;
  providerName?: string;
  modelName?: string;
  includeDetails?: boolean;
  granularity?: 'daily' | 'weekly' | 'monthly';
}

export interface LLMUsageStatsResponse {
  success: boolean;
  data: LLMUsageStats;
  message?: string;
}

export interface LLMUsageRecordsRequest {
  startDate?: string;
  endDate?: string;
  callerType?: string;
  provider?: string;
  model?: string;
  status?: 'pending' | 'completed' | 'failed' | 'cancelled';
  dataClassification?: string;
  limit?: number;
  offset?: number;
}

export interface LLMUsageRecordsResponse {
  success: boolean;
  data: {
    records: LLMUsageRecord[];
    total: number;
    page: number;
    limit: number;
  };
  message?: string;
}

export interface SystemHealthResponse {
  success: boolean;
  data: SystemHealthMetrics;
  message?: string;
}

export interface OperationalStatusResponse {
  success: boolean;
  data: OperationalStatus;
  message?: string;
}

export interface PerformanceMetricsResponse {
  success: boolean;
  data: PerformanceMetrics[];
  message?: string;
}

export interface CostAnalysisResponse {
  success: boolean;
  data: CostAnalysis;
  message?: string;
}

export interface ComplianceMetricsResponse {
  success: boolean;
  data: ComplianceMetrics;
  message?: string;
}

export interface AlertsResponse {
  success: boolean;
  data: {
    alerts: Alert[];
    total: number;
    active: number;
    resolved: number;
  };
  message?: string;
}

// =====================================
// FILTER AND SORT OPTIONS
// =====================================

export interface LLMMonitoringFilters {
  provider?: string | 'all';
  model?: string | 'all';
  status?: string | 'all';
  dataClassification?: string | 'all';
  alertType?: string | 'all';
  alertSeverity?: string | 'all';
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  search?: string;
}

export interface LLMMonitoringSortOptions {
  field: 'timestamp' | 'responseTime' | 'cost' | 'tokens' | 'provider' | 'model' | 'status';
  direction: 'asc' | 'desc';
}

// =====================================
// DASHBOARD & VISUALIZATION
// =====================================

export interface LLMDashboardData {
  summary: {
    totalRequests: number;
    totalCost: number;
    averageResponseTime: number;
    successRate: number;
    activeAlerts: number;
    systemHealth: 'healthy' | 'warning' | 'critical';
  };
  recentActivity: LLMUsageRecord[];
  costTrends: {
    date: string;
    cost: number;
    requests: number;
  }[];
  performanceMetrics: PerformanceMetrics[];
  alerts: Alert[];
  complianceStatus: {
    score: number;
    violations: number;
    piiDetectionRate: number;
  };
}

export interface LLMDashboardResponse {
  success: boolean;
  data: LLMDashboardData;
  timestamp: string;
  message?: string;
}

// =====================================
// REAL-TIME MONITORING
// =====================================

export interface RealTimeMetrics {
  currentRequests: number;
  requestsPerMinute: number;
  averageResponseTime: number;
  errorRate: number;
  systemLoad: number;
  memoryUsage: number;
  activeModels: string[];
  recentErrors: {
    timestamp: string;
    error: string;
    model?: string;
    provider?: string;
  }[];
}

export interface RealTimeUpdate {
  type: 'metrics' | 'alert' | 'status' | 'usage';
  data: JsonValue;
  timestamp: string;
}
