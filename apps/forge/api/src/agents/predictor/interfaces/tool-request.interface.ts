/**
 * Tool Request entity interface - represents requests for new tools/sources
 * Based on prediction.tool_requests table
 * Generated from missed opportunity analysis
 */

/**
 * Tool request status
 */
export type ToolRequestStatus =
  | 'wishlist'
  | 'planned'
  | 'in_progress'
  | 'done'
  | 'rejected';

/**
 * Tool request priority
 */
export type ToolRequestPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Tool request type
 */
export type ToolRequestType = 'source' | 'api' | 'integration' | 'feature';

/**
 * Tool request entity
 */
export interface ToolRequest {
  id: string;
  universe_id: string;
  missed_opportunity_id: string | null;
  type: ToolRequestType;
  name: string;
  description: string;
  rationale: string;
  suggested_url: string | null;
  suggested_config: Record<string, unknown> | null;
  priority: ToolRequestPriority;
  status: ToolRequestStatus;
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Create tool request data
 */
export interface CreateToolRequestData {
  universe_id: string;
  missed_opportunity_id?: string;
  type: ToolRequestType;
  name: string;
  description: string;
  rationale: string;
  suggested_url?: string;
  suggested_config?: Record<string, unknown>;
  priority?: ToolRequestPriority;
  status?: ToolRequestStatus;
}

/**
 * Update tool request data
 */
export interface UpdateToolRequestData {
  name?: string;
  description?: string;
  rationale?: string;
  suggested_url?: string;
  suggested_config?: Record<string, unknown>;
  priority?: ToolRequestPriority;
  status?: ToolRequestStatus;
  resolution_notes?: string;
  resolved_at?: string;
  resolved_by_user_id?: string;
}

/**
 * Tool suggestion from missed opportunity analysis
 */
export interface ToolSuggestion {
  type: ToolRequestType;
  name: string;
  description: string;
  rationale: string;
  suggested_url?: string;
  suggested_config?: Record<string, unknown>;
  priority: ToolRequestPriority;
  confidence: number;
}
