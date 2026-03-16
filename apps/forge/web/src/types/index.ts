// Comprehensive Type Definitions Index
// This file serves as the central export point for all TypeScript interfaces
// used across the Pinia stores and frontend application

// =====================================
// API TYPES
// =====================================
export * from './api';

// =====================================
// CHAT & MESSAGING TYPES
// =====================================
export * from './chat';

// =====================================
// DELIVERABLE TYPES
// =====================================
export * from './deliverables';

// =====================================
// EVALUATION TYPES
// =====================================
export * from './evaluation';

// =====================================
// LLM TYPES (selective export to avoid conflicts)
// =====================================
export type {
  Provider,
  Model,
  LLMSelection,
  LLMUsageMetrics,
  EnhancedMessage,
  CIDAFMCommand,
  CIDAFMOptions,
  UnifiedLLMResponse,
  StandardizedLLMError
} from './llm';

// =====================================
// PII & PSEUDONYM TYPES
// =====================================
export * from './pii';

// =====================================
// TASK TYPES
// =====================================
export * from './task';

// =====================================
// MESSAGE TYPES
// =====================================
export * from './message';

// =====================================
// AGENT TYPES
// =====================================
export * from './agent';

// =====================================
// AUTH TYPES
// =====================================
export * from './auth';

// =====================================
// RISK AGENT TYPES
// =====================================
export * from './risk-agent';

// =====================================
// LLM MONITORING TYPES (selective export to avoid conflicts)
// =====================================
export type {
  LLMUsageRecord,
  SystemHealthMetrics,
  ModelHealthMetrics,
  Alert,
  LLMMonitoringFilters,
  LLMDashboardData,
  RealTimeMetrics,
  LLMDashboardResponse,
  PerformanceMetrics,
  CostAnalysis,
  ComplianceMetrics
} from './llm-monitoring';

// =====================================
// ANALYTICS TYPES (selective export to avoid conflicts)
// =====================================
export type {
  TimeRange,
  AnalyticsFilters,
  AnalyticsFiltersUI,
  AnalyticsSortOptions,
  MetricTrend,
  PerformanceMetric,
  EvaluationAnalytics,
  WorkflowAnalytics,
  ConstraintAnalytics,
  TaskAnalytics,
  SystemAnalytics,
  BusinessMetrics,
  DashboardData,
  RealTimeAnalytics,
  ReportConfig,
  GeneratedReport,
  AnalyticsEvent,
  EventTrackingConfig,
  AnalyticsRequest,
  AnalyticsResponse,
  ChartData,
  ChartOptions,
  VisualizationConfig,
  ExportConfig,
  ShareConfig
} from './analytics';

// =====================================
// VALIDATION TYPES
// =====================================
export * from './validation';

// =====================================
// STORE TYPES
// =====================================
export * from './store';

// =====================================
// SHARED UTILITY TYPES
// =====================================

export type Primitive = string | number | boolean | null;
export type JsonValue = Primitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type UnknownRecord = Record<string, JsonValue>;

// =====================================
// COMMON STORE TYPES
// =====================================

/**
 * Common loading states used across all stores
 */
export interface LoadingStates {
  isLoading: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  isBulkOperating: boolean;
}

/**
 * Common error handling interface
 */
export interface ErrorState {
  error: string | null;
  errorCode?: string;
  errorDetails?: JsonValue;
  lastError?: Date;
}

/**
 * Common pagination interface
 */
export interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/**
 * Common sort options interface
 */
export interface SortOptions {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * Common filter interface
 */
export interface BaseFilters {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

/**
 * Common selection state for bulk operations
 */
export interface SelectionState<T = string> {
  selectedItems: T[];
  isAllSelected: boolean;
  isIndeterminate: boolean;
}

/**
 * Common API response wrapper
 */
export interface StoreApiResponse<T = JsonValue> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    total?: number;
    page?: number;
    limit?: number;
    timestamp?: string;
  };
}

/**
 * Common store configuration
 */
export interface StoreConfig {
  autoRefresh?: boolean;
  refreshInterval?: number;
  cacheTimeout?: number;
  enableLogging?: boolean;
  enableAnalytics?: boolean;
}

/**
 * Common data validation interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    field: string;
    message: string;
    code?: string;
  }>;
  warnings?: Array<{
    field: string;
    message: string;
  }>;
}

/**
 * Common audit trail interface
 */
export interface AuditTrail {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId?: string;
  timestamp: string;
  changes?: Record<string, { before: JsonValue; after: JsonValue }>;
  metadata?: UnknownRecord;
}

/**
 * Common notification interface
 */
export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actions?: Array<{
    label: string;
    action: () => void;
  }>;
  autoClose?: boolean;
  duration?: number;
}

/**
 * Common export configuration
 */
export interface ExportOptions {
  format: 'json' | 'csv' | 'excel' | 'pdf';
  includeHeaders: boolean;
  includeMetadata: boolean;
  dateRange?: {
    from: string;
    to: string;
  };
  filters?: UnknownRecord;
  fields?: string[];
}

/**
 * Common import configuration
 */
export interface ImportOptions {
  format: 'json' | 'csv' | 'excel';
  hasHeaders: boolean;
  skipValidation: boolean;
  batchSize: number;
  onProgress?: (progress: number) => void;
  onError?: (error: string, rowIndex?: number) => void;
  fieldMapping?: Record<string, string>;
}

/**
 * Common bulk operation result
 */
export interface BulkOperationResult {
  success: boolean;
  totalProcessed: number;
  successCount: number;
  errorCount: number;
  errors: Array<{
    id: string;
    error: string;
  }>;
  duration: number;
  timestamp: string;
}

/**
 * Common cache entry interface
 */
export interface CacheEntry<T = JsonValue> {
  data: T;
  timestamp: number;
  ttl: number;
  key: string;
}

/**
 * Common real-time update interface
 */
export interface RealTimeUpdate<T = JsonValue> {
  type: 'create' | 'update' | 'delete' | 'bulk_update';
  entityType: string;
  entityId?: string;
  data?: T;
  timestamp: string;
  userId?: string;
}

/**
 * Common search configuration
 */
export interface SearchConfig {
  enabled: boolean;
  fields: string[];
  fuzzySearch: boolean;
  minLength: number;
  debounceMs: number;
  highlightMatches: boolean;
}

/**
 * Common filter configuration
 */
export interface FilterConfig {
  field: string;
  type: 'text' | 'select' | 'multiselect' | 'date' | 'daterange' | 'number' | 'boolean';
  label: string;
  options?: Array<{ label: string; value: JsonValue }>;
  defaultValue?: JsonValue;
  required?: boolean;
  validation?: (value: unknown) => boolean;
}

/**
 * Common table column configuration
 */
export interface ColumnConfig {
  key: string;
  label: string;
  sortable: boolean;
  filterable: boolean;
  width?: string;
  minWidth?: string;
  maxWidth?: string;
  align?: 'left' | 'center' | 'right';
  format?: (value: JsonValue) => string;
  component?: string;
  visible?: boolean;
}

/**
 * Common dashboard widget configuration
 */
export interface WidgetConfig {
  id: string;
  type: 'metric' | 'chart' | 'table' | 'list' | 'custom';
  title: string;
  description?: string;
  size: { width: number; height: number };
  position: { x: number; y: number };
  dataSource: string;
  refreshInterval?: number;
  config: UnknownRecord;
  permissions?: string[];
}

/**
 * Common user preferences interface
 */
export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  timezone: string;
  dateFormat: string;
  timeFormat: '12h' | '24h';
  pageSize: number;
  autoRefresh: boolean;
  notifications: {
    email: boolean;
    push: boolean;
    desktop: boolean;
  };
  dashboard: {
    layout: WidgetConfig[];
    defaultView: string;
  };
}

// =====================================
// STORE STATE INTERFACES
// =====================================

/**
 * Base store state that all stores should extend
 */
export interface BaseStoreState {
  // Loading states
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  
  // Configuration
  config: StoreConfig;
  
  // User preferences
  preferences: Partial<UserPreferences>;
}

/**
 * Store state for data-driven stores (CRUD operations)
 */
export interface DataStoreState<T = JsonValue> extends BaseStoreState {
  // Data
  items: T[];
  selectedItems: string[];
  
  // Pagination
  pagination: PaginationState;
  
  // Filtering & Sorting
  filters: UnknownRecord;
  sortOptions: SortOptions;
  
  // Search
  searchQuery: string;
  searchResults: T[];
  
  // Cache
  cache: Map<string, CacheEntry<T>>;
}

/**
 * Store state for monitoring/analytics stores
 */
export interface MonitoringStoreState extends BaseStoreState {
  // Real-time data
  realTimeData: JsonValue;
  isRealTimeEnabled: boolean;
  
  // Metrics
  metrics: UnknownRecord;
  alerts: Notification[];
  
  // Historical data
  historicalData: Record<string, JsonValue[]>;
  
  // Auto-refresh
  autoRefreshEnabled: boolean;
  autoRefreshInterval: number;
  refreshTimer: NodeJS.Timeout | null;
}

// =====================================
// TYPE GUARDS
// =====================================

/**
 * Type guard to check if an object is a valid API response
 */
export function isApiResponse<T>(obj: unknown): obj is StoreApiResponse<T> {
  return Boolean(obj) && typeof obj === 'object' &&
    typeof (obj as { success?: unknown }).success === 'boolean';
}

/**
 * Type guard to check if an object is a validation result
 */
export function isValidationResult(obj: unknown): obj is ValidationResult {
  return Boolean(obj) && typeof obj === 'object' &&
    typeof (obj as ValidationResult).isValid === 'boolean' &&
    Array.isArray((obj as ValidationResult).errors);
}

/**
 * Type guard to check if an object is a notification
 */
export function isNotification(obj: unknown): obj is Notification {
  return Boolean(obj) && typeof obj === 'object' &&
    typeof (obj as Notification).id === 'string' &&
    typeof (obj as Notification).type === 'string' &&
    typeof (obj as Notification).title === 'string' &&
    typeof (obj as Notification).message === 'string';
}

// =====================================
// UTILITY TYPES
// =====================================

/**
 * Make all properties of T optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Make specified properties of T required
 */
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Extract the return type of a store action
 */
export type ActionReturnType<T> = T extends (...args: unknown[]) => infer R ? R : never;

/**
 * Extract the payload type of a store action
 */
export type ActionPayload<T> = T extends (payload: infer P) => unknown ? P : never;

/**
 * Create a union type of all keys in T that have values of type V
 */
export type KeysOfType<T, V> = {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T];

/**
 * Create a type that represents the state of a Pinia store
 */
export type StoreState<T> = T extends (...args: unknown[]) => infer R ? R : never;

/**
 * Create a type that represents the getters of a Pinia store
 */
export type StoreGetters<T> = {
  readonly [K in keyof T]: T[K] extends (...args: unknown[]) => infer R ? R : T[K];
};

/**
 * Create a type that represents the actions of a Pinia store
 */
export type StoreActions<T> = {
  [K in keyof T]: T[K] extends (...args: unknown[]) => unknown ? T[K] : never;
};

// =====================================
// CONSTANTS
// =====================================

/**
 * Common HTTP status codes
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
} as const;

/**
 * Common error codes used across stores
 */
export const ERROR_CODES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
  TIMEOUT: 'TIMEOUT',
  UNKNOWN: 'UNKNOWN'
} as const;

/**
 * Common loading states
 */
export const LOADING_STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error'
} as const;

/**
 * Common operation types
 */
export const OPERATION_TYPES = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  BULK_CREATE: 'bulk_create',
  BULK_UPDATE: 'bulk_update',
  BULK_DELETE: 'bulk_delete',
  IMPORT: 'import',
  EXPORT: 'export'
} as const;

// Export type versions of constants for type safety
export type HttpStatus = typeof HTTP_STATUS[keyof typeof HTTP_STATUS];
export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];
export type LoadingState = typeof LOADING_STATES[keyof typeof LOADING_STATES];
export type OperationType = typeof OPERATION_TYPES[keyof typeof OPERATION_TYPES];
