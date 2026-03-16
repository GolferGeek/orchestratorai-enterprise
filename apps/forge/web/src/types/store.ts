// Store-specific TypeScript interfaces
// This file contains interfaces specifically designed for Pinia store implementations

import type {
  DataStoreState,
  MonitoringStoreState
} from './index';

import type {
  PIIPattern,
  PIITestResponse,
  PIIStatsResponse,
  PseudonymDictionaryEntry,
  PseudonymGenerateResponse,
  PseudonymLookupResponse,
  PseudonymStatsResponse,
} from './pii';

import type {
  LLMUsageRecord,
  SystemHealthMetrics,
  ModelHealthMetrics,
  Alert
} from './llm-monitoring';

import type {
  DashboardData,
  EvaluationAnalytics,
  WorkflowAnalytics,
  UsageStats,
  CostSummary,
  ModelPerformance,
  AnalyticsEvent,
  ReportConfig,
  GeneratedReport,
} from './analytics';

// =====================================
// STORE INTERFACE DEFINITIONS
// =====================================

/**
 * Interface for PII Patterns Store State
 */
export interface PIIPatternsStoreState extends DataStoreState<PIIPattern> {
  // PII-specific state
  patterns: PIIPattern[];
  testResults: PIITestResponse | null;
  statistics: PIIStatsResponse | null;
  
  // PII-specific filters
  filters: {
    dataType: string;
    enabled: string;
    category: string;
    builtIn: string;
    search: string;
  };
  
  // Testing state
  isTestingPattern: boolean;
  testInput: string;
}

/**
 * Interface for Pseudonym Dictionaries Store State
 */
export interface PseudonymDictionariesStoreState extends DataStoreState<PseudonymDictionaryEntry> {
  // Pseudonym-specific state
  dictionaries: PseudonymDictionaryEntry[];
  generationResults: PseudonymGenerateResponse | null;
  lookupResults: PseudonymLookupResponse | null;
  statistics: PseudonymStatsResponse | null;
  
  // Import/Export state
  isImporting: boolean;
  isExporting: boolean;
  importProgress: number;
  exportProgress: number;
  
  // Pseudonym-specific filters
  filters: {
    category: string;
    dataType: string;
    active: string;
    search: string;
  };
}

/**
 * Interface for LLM Monitoring Store State
 */
export interface LLMMonitoringStoreState extends MonitoringStoreState {
  // LLM-specific monitoring data
  usageRecords: LLMUsageRecord[];
  systemHealth: SystemHealthMetrics | null;
  activeAlerts: Alert[];
  modelMetrics: ModelHealthMetrics[];
  
  // LLM-specific filters
  filters: {
    provider: string;
    model: string;
    status: string;
    dateRange: string;
    search: string;
  };
  
  // Real-time monitoring
  isMonitoring: boolean;
  alertsEnabled: boolean;
  thresholds: Record<string, number>;
}

/**
 * Interface for Analytics Store State
 */
export interface AnalyticsStoreState extends MonitoringStoreState {
  // Analytics-specific data
  dashboardData: DashboardData | null;
  evaluationAnalytics: EvaluationAnalytics | null;
  workflowAnalytics: WorkflowAnalytics | null;
  usageStats: UsageStats | null;
  costSummary: CostSummary | null;
  modelPerformance: ModelPerformance[];

  // Analytics-specific filters
  filters: {
    timeRange: string;
    userRole: string;
    provider: string;
    model: string;
    status: string;
    granularity: 'daily' | 'weekly' | 'monthly';
    includeDetails: boolean;
    search: string;
  };
  
  // Event tracking
  eventQueue: AnalyticsEvent[];
  eventTrackingEnabled: boolean;
  
  // Reporting
  reportConfigs: ReportConfig[];
  generatedReports: GeneratedReport[];
}

// =====================================
// STORE ACTION INTERFACES
// =====================================
// (Deprecated legacy store helper interfaces removed.)
