// PII Management Types
// Based on backend PIIPatternService interfaces

import type { JsonObject } from '@orchestrator-ai/transport-types';

export type PIIDataType = 'email' | 'phone' | 'name' | 'address' | 'ip_address' | 'username' | 'credit_card' | 'ssn' | 'custom';

export interface PIIPattern {
  id?: string; // For database-stored patterns
  name: string;
  dataType: PIIDataType;
  pattern: string; // RegExp as string for JSON serialization
  validator?: string; // Validator function as string
  description: string;
  priority?: number; // Lower number = higher priority
  enabled?: boolean;
  category?: string;
  isBuiltIn?: boolean; // Distinguish between built-in and custom patterns
  createdAt?: string;
  updatedAt?: string;
}

export interface PIIMatch {
  value: string;
  dataType: PIIDataType;
  patternName: string;
  startIndex: number;
  endIndex: number;
  confidence: number; // 0-1 score based on validator
}

export interface PIIDetectionResult {
  matches: PIIMatch[];
  processingTime: number;
  patternsChecked: number;
  sanitizedText?: string;
  originalText?: string;
}

export interface PIITestRequest {
  text: string;
  enableRedaction?: boolean;
  enablePseudonymization?: boolean;
  context?: string;
}

export interface PIITestResponse {
  success: boolean;
  sanitizedText?: string;
  originalLength?: number;
  sanitizedLength?: number;
  processingTime?: number;
  redactionApplied?: boolean;
  pseudonymizationApplied?: boolean;
  detectionResult?: PIIDetectionResult;
  message?: string;
}

export interface PIIStatsResponse {
  success: boolean;
  totalPatterns: number;
  enabledPatterns: number;
  customPatterns: number;
  builtInPatterns: number;
  recentDetections: number;
  processingStats: {
    averageProcessingTime: number;
    totalProcessed: number;
    successRate: number;
  };
}

// Filter and sort options for PII patterns
export interface PIIPatternFilters {
  dataType?: PIIDataType | 'all';
  enabled?: boolean | 'all';
  isBuiltIn?: boolean | 'all';
  category?: string | 'all';
  search?: string;
}

export interface PIIPatternSortOptions {
  field: 'name' | 'dataType' | 'priority' | 'enabled' | 'createdAt';
  direction: 'asc' | 'desc';
}

// Bulk operations
export interface PIIPatternBulkOperation {
  operation: 'enable' | 'disable' | 'delete';
  patternIds: string[];
}

export interface PIIPatternBulkResult {
  success: boolean;
  affectedCount: number;
  errors?: string[];
}

// =====================================
// PSEUDONYM DICTIONARY TYPES
// =====================================

export interface PseudonymResult {
  originalValue: string;
  pseudonym: string;
  dataType: PIIDataType;
  isNew: boolean;
  context?: string;
}

export interface PseudonymizationResult {
  originalText: string;
  pseudonymizedText: string;
  pseudonyms: PseudonymResult[];
  processingTime: number;
}

export interface PseudonymMapping {
  id?: string;
  originalHash: string; // Hashed version of original value for privacy
  pseudonym: string;
  dataType: PIIDataType;
  context?: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
}

export interface PseudonymDictionaryEntry {
  id?: string;
  category: string; // e.g., 'names', 'companies', 'locations'
  dataType: PIIDataType;
  words: string[]; // Array of pseudonym words for this category
  frequencyWeights?: Record<string, number>; // Optional weights for word selection
  description?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PseudonymGenerateRequest {
  value: string;
  dataType: PIIDataType;
  context?: string;
}

export interface PseudonymGenerateResponse {
  success: boolean;
  originalValue?: string;
  pseudonym?: string;
  dataType?: PIIDataType;
  isNew?: boolean;
  context?: string;
  message?: string;
}

export interface PseudonymLookupRequest {
  value: string;
  dataType: PIIDataType;
}

export interface PseudonymLookupResponse {
  success: boolean;
  originalValue?: string;
  dataType?: PIIDataType;
  pseudonym?: string;
  found: boolean;
  message?: string;
}

export interface PseudonymStatsResponse {
  success: boolean;
  stats: {
    totalMappings: number;
    mappingsByType: Record<PIIDataType, number>;
    totalUsage: number;
    averageUsagePerMapping: number;
    recentActivity: {
      last24h: number;
      last7d: number;
      last30d: number;
    };
  };
  timestamp: string;
}

export interface ReversePseudonymizationRequest {
  sanitizedText: string;
  reversalContext?: JsonObject;
  requestId?: string;
}

export interface ReversePseudonymizationResponse {
  success: boolean;
  originalText?: string;
  reversalCount?: number;
  processingTimeMs?: number;
  source?: 'memory' | 'database' | 'context';
  message?: string;
}

// Filter and sort options for pseudonym dictionaries
export interface PseudonymDictionaryFilters {
  category?: string | 'all';
  dataType?: PIIDataType | 'all';
  isActive?: boolean | 'all';
  search?: string;
}

export interface PseudonymDictionarySortOptions {
  field: 'category' | 'dataType' | 'wordsCount' | 'createdAt' | 'updatedAt';
  direction: 'asc' | 'desc';
}

// Bulk import/export interfaces
export interface PseudonymDictionaryImportData {
  category: string;
  dataType: PIIDataType;
  words?: string[]; // Old format - for backward compatibility
  entries?: Array<{ originalValue: string; pseudonym?: string }>; // New format
  frequencyWeights?: Record<string, number>;
  description?: string;
}

export interface PseudonymDictionaryExportData {
  dictionaries: PseudonymDictionaryEntry[];
  exportedAt: string;
  version: string;
}

export interface PseudonymDictionaryBulkOperation {
  operation: 'activate' | 'deactivate' | 'delete';
  dictionaryIds: string[];
}

export interface PseudonymDictionaryBulkResult {
  success: boolean;
  affectedCount: number;
  errors?: string[];
}

// =====================================
// PRIVACY DASHBOARD TYPES
// =====================================

/**
 * Privacy metrics summary
 */
export interface PrivacyMetrics {
  totalDetections: number;
  totalSanitizations: number;
  piiTypesDetected: Record<PIIDataType, number>;
  averageProcessingTime: number;
  detectionRate: number;
  sanitizationRate: number;
  totalDataProcessed: number;
  activePatterns: number;
  activeDictionaries: number;
}

/**
 * Detection statistics by data type
 */
export interface DetectionStats {
  dataType: PIIDataType;
  count: number;
  percentage: number;
  trend: 'up' | 'down' | 'stable';
  lastDetection?: string;
  avgConfidence: number;
}

/**
 * Pattern usage statistics
 */
export interface PatternUsageStats {
  patternId: string;
  patternName: string;
  dataType: PIIDataType;
  matchCount: number;
  lastUsed: string;
  accuracy: number;
  avgProcessingTime: number;
}

/**
 * Sanitization method statistics
 */
export interface SanitizationMethodStats {
  method: 'redaction' | 'pseudonymization' | 'masking' | 'encryption';
  usageCount: number;
  successRate: number;
  avgProcessingTime: number;
  dataTypesUsed: PIIDataType[];
}

/**
 * Performance data point
 */
export interface PerformanceDataPoint {
  timestamp: string;
  processingTime: number;
  detectionCount: number;
  dataSize: number;
  operation: 'detection' | 'sanitization' | 'lookup';
}

/**
 * System health indicators
 */
export interface SystemHealthIndicators {
  status: 'healthy' | 'degraded' | 'critical';
  uptime: number;
  memoryUsage: number;
  cpuUsage: number;
  errorRate: number;
  lastHealthCheck: string;
  issues: Array<{
    severity: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    timestamp: string;
  }>;
}

/**
 * Recent activity log entry
 */
export interface RecentActivityEntry {
  id: string;
  timestamp: string;
  type: 'detection' | 'sanitization' | 'pattern_update' | 'dictionary_update' | 'system_event';
  description: string;
  userId?: string;
  dataType?: PIIDataType;
  details?: Record<string, unknown>;
}

/**
 * Complete privacy dashboard data
 */
export interface PrivacyDashboardData {
  metrics: PrivacyMetrics;
  detectionStats: DetectionStats[];
  patternUsage: PatternUsageStats[];
  sanitizationMethods: SanitizationMethodStats[];
  performanceData: PerformanceDataPoint[];
  systemHealth: SystemHealthIndicators;
  recentActivity: RecentActivityEntry[];
}

/**
 * Dashboard filters
 */
export interface PIIDashboardFilters {
  timeRange: 'hour' | 'day' | 'week' | 'month' | 'year' | 'custom';
  customStartDate?: string;
  customEndDate?: string;
  dataType: PIIDataType[] | 'all';
  includeSystemEvents: boolean;
}
