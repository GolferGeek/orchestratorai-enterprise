/**
 * Dashboard Mode Types
 * Defines mode-specific payloads and metadata for dashboard operations
 * Used by prediction system and other A2A dashboard mode implementations
 */

import type { JsonValue } from '../shared/json.types';

// ============================================================================
// DASHBOARD ACTIONS
// ============================================================================

/**
 * Dashboard Actions
 * Standard CRUD operations plus entity-specific actions
 */
export type DashboardAction =
  | 'list'
  | 'get'
  | 'create'
  | 'update'
  | 'delete'
  // Entity-specific actions
  | 'testCrawl' // source
  | 'getSnapshot' // prediction
  | 'respond' // review_queue, learning_queue
  | 'updateStatus'; // tool_request

// ============================================================================
// REQUEST/RESPONSE PAYLOADS
// ============================================================================

/**
 * Dashboard Request Payload
 * Generic request structure for dashboard operations
 */
export interface DashboardRequestPayload<T = JsonValue> {
  /** Action to perform (combined with entity in method name) */
  action: string; // Format: '<entity>.<operation>' e.g. 'universes.list'
  /** Action-specific parameters */
  params?: T;
  /** Optional filters for list operations */
  filters?: Record<string, unknown>;
  /** Optional pagination for list operations */
  pagination?: {
    page?: number;
    pageSize?: number;
    offset?: number;
    limit?: number;
  };
  /** Optional sorting for list operations */
  sort?: {
    field: string;
    direction: 'asc' | 'desc';
  }[];
}

/**
 * Dashboard Response Payload
 * Generic response structure for dashboard operations
 */
export interface DashboardResponsePayload<T = JsonValue> {
  /** Response content */
  content: T;
  /** Response metadata */
  metadata?: {
    /** Total count for list operations */
    totalCount?: number;
    /** Current page */
    page?: number;
    /** Page size */
    pageSize?: number;
    /** Has more results */
    hasMore?: boolean;
    /** Additional metadata */
    [key: string]: unknown;
  };
}

/**
 * Dashboard Mode Payload (union of request payload)
 */
export type DashboardModePayload = DashboardRequestPayload<unknown>;

/**
 * Dashboard Request Metadata
 */
export interface DashboardRequestMetadata {
  /** Source of the request (e.g., 'web-ui', 'api', 'cli') */
  source: string;
  /** Client version (optional) */
  clientVersion?: string;
}

/**
 * Dashboard Response Metadata
 */
export interface DashboardResponseMetadata {
  /** Server timestamp */
  serverTime?: string;
  /** Cache information (optional) */
  cache?: {
    hit: boolean;
    ttl?: number;
  };
}

// ============================================================================
// PREDICTION ENTITY PAYLOADS - Universe
// ============================================================================

export interface UniverseListParams {
  domain?: 'stocks' | 'crypto' | 'elections' | 'polymarket';
  strategyId?: string;
}

export interface UniverseGetParams {
  id: string;
}

export interface UniverseCreateParams {
  name: string;
  domain: 'stocks' | 'crypto' | 'elections' | 'polymarket';
  description?: string;
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
}

export interface UniverseUpdateParams {
  id: string;
  name?: string;
  description?: string;
  strategyId?: string;
  llmConfig?: Record<string, unknown>;
}

export interface UniverseDeleteParams {
  id: string;
}

// ============================================================================
// PREDICTION ENTITY PAYLOADS - Target
// ============================================================================

export interface TargetListParams {
  universeId?: string;
  targetType?: string;
}

export interface TargetGetParams {
  id: string;
}

export interface TargetCreateParams {
  universeId: string;
  name: string;
  symbol: string;
  targetType: string;
  context?: string;
  llmConfigOverride?: Record<string, unknown>;
}

export interface TargetUpdateParams {
  id: string;
  name?: string;
  context?: string;
  llmConfigOverride?: Record<string, unknown>;
}

export interface TargetDeleteParams {
  id: string;
}

// ============================================================================
// PREDICTION ENTITY PAYLOADS - Prediction
// ============================================================================

export interface PredictionListParams {
  universeId?: string;
  targetId?: string;
  status?: 'active' | 'resolved' | 'expired' | 'cancelled';
  domain?: string;
  /** Include test data in results (default: false) */
  includeTestData?: boolean;
}

export interface PredictionGetParams {
  id: string;
}

export interface PredictionGetSnapshotParams {
  id: string;
}

// ============================================================================
// PREDICTION ENTITY PAYLOADS - Source
// ============================================================================

export interface SourceListParams {
  scopeLevel?: 'runner' | 'domain' | 'universe' | 'target';
  universeId?: string;
  targetId?: string;
  domain?: string;
}

export interface SourceGetParams {
  id: string;
}

export interface SourceCreateParams {
  name: string;
  sourceType: 'web' | 'rss' | 'twitter_search' | 'api';
  scopeLevel: 'runner' | 'domain' | 'universe' | 'target';
  universeId?: string;
  targetId?: string;
  domain?: string;
  crawlConfig: {
    url?: string;
    frequency?: '5min' | '10min' | '15min' | '30min' | 'hourly';
    selector?: string;
    waitForElement?: string;
    [key: string]: unknown;
  };
  authConfig?: Record<string, unknown>;
}

export interface SourceUpdateParams {
  id: string;
  name?: string;
  crawlConfig?: Record<string, unknown>;
  authConfig?: Record<string, unknown>;
  active?: boolean;
}

export interface SourceDeleteParams {
  id: string;
}

export interface SourceTestCrawlParams {
  id?: string;
  url?: string;
  crawlConfig?: Record<string, unknown>;
  authConfig?: Record<string, unknown>;
}

// ============================================================================
// PREDICTION ENTITY PAYLOADS - Analyst
// ============================================================================

export interface AnalystListParams {
  scopeLevel?: 'runner' | 'domain' | 'universe' | 'target';
  domain?: string;
  universeId?: string;
}

export interface AnalystGetParams {
  id: string;
}

export interface AnalystCreateParams {
  slug: string;
  name: string;
  perspective: string;
  scopeLevel: 'runner' | 'domain' | 'universe' | 'target';
  domain?: string;
  universeId?: string;
  targetId?: string;
  defaultWeight?: number;
  tierInstructions?: {
    gold?: string;
    silver?: string;
    bronze?: string;
  };
}

export interface AnalystUpdateParams {
  id: string;
  name?: string;
  perspective?: string;
  defaultWeight?: number;
  tierInstructions?: Record<string, unknown>;
  learnedPatterns?: Record<string, unknown>;
  active?: boolean;
}

export interface AnalystDeleteParams {
  id: string;
}

// ============================================================================
// PREDICTION ENTITY PAYLOADS - Learning
// ============================================================================

export interface LearningListParams {
  scopeLevel?: 'runner' | 'domain' | 'universe' | 'target';
  domain?: string;
  universeId?: string;
  targetId?: string;
  analystId?: string;
  learningType?: 'rule' | 'pattern' | 'weight_adjustment' | 'threshold' | 'avoid';
  status?: 'active' | 'superseded' | 'archived';
}

export interface LearningGetParams {
  id: string;
}

export interface LearningCreateParams {
  title: string;
  learningType: 'rule' | 'pattern' | 'weight_adjustment' | 'threshold' | 'avoid';
  scopeLevel: 'runner' | 'domain' | 'universe' | 'target';
  domain?: string;
  universeId?: string;
  targetId?: string;
  analystId?: string;
  content: string;
  sourceType: 'human' | 'ai_suggested' | 'ai_approved';
  sourceEvaluationId?: string;
  sourceMissedOpportunityId?: string;
}

export interface LearningUpdateParams {
  id: string;
  title?: string;
  content?: string;
  status?: 'active' | 'superseded' | 'archived';
}

export interface LearningDeleteParams {
  id: string;
}

// ============================================================================
// PREDICTION ENTITY PAYLOADS - Learning Queue
// ============================================================================

export interface LearningQueueListParams {
  status?: 'pending' | 'approved' | 'rejected';
  universeId?: string;
}

export interface LearningQueueGetParams {
  id: string;
}

export interface LearningQueueRespondParams {
  id: string;
  decision: 'approve' | 'reject' | 'modify';
  modifiedContent?: string;
  modifiedScopeLevel?: 'runner' | 'domain' | 'universe' | 'target';
  modifiedDomain?: string;
  modifiedUniverseId?: string;
  modifiedTargetId?: string;
  modifiedAnalystId?: string;
  userNote?: string;
}

// ============================================================================
// PREDICTION ENTITY PAYLOADS - Review Queue
// ============================================================================

export interface ReviewQueueListParams {
  universeId?: string;
  targetId?: string;
  status?: 'pending' | 'approved' | 'rejected' | 'modified';
}

export interface ReviewQueueGetParams {
  id: string;
}

export interface ReviewQueueRespondParams {
  id: string;
  decision: 'approve' | 'reject' | 'modify';
  modifiedStrength?: number;
  modifiedDirection?: string;
  modifiedReasoning?: string;
  createLearning?: boolean;
  learningNote?: string;
}

// ============================================================================
// PREDICTION ENTITY PAYLOADS - Strategy
// ============================================================================

export interface StrategyListParams {
  // Strategies are read-only system resources
}

export interface StrategyGetParams {
  id: string;
}

// ============================================================================
// PREDICTION ENTITY PAYLOADS - Missed Opportunity
// ============================================================================

export interface MissedOpportunityListParams {
  universeId?: string;
  targetId?: string;
  domain?: string;
}

export interface MissedOpportunityGetParams {
  id: string;
}

// ============================================================================
// PREDICTION ENTITY PAYLOADS - Tool Request
// ============================================================================

export interface ToolRequestListParams {
  universeId?: string;
  status?: 'wishlist' | 'planned' | 'in_progress' | 'done' | 'rejected';
}

export interface ToolRequestCreateParams {
  universeId: string;
  toolType: 'source' | 'integration' | 'analyst' | 'other';
  title: string;
  description: string;
  sourceType?: 'web' | 'rss' | 'twitter_search' | 'api';
  suggestedConfig?: Record<string, unknown>;
  sourceMissedOpportunityId?: string;
}

export interface ToolRequestUpdateStatusParams {
  id: string;
  status: 'wishlist' | 'planned' | 'in_progress' | 'done' | 'rejected';
  userNote?: string;
}
