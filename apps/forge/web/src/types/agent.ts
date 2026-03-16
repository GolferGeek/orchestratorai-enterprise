import type { JsonValue, JsonObject } from '@orchestrator-ai/transport-types';

/**
 * Agent Type Definitions
 * Domain-specific types for agent management and hierarchy
 */

// =====================================
// AGENT HIERARCHY
// =====================================

/**
 * Agent hierarchy node metadata
 */
export interface AgentNodeMetadata {
  /** Display name for the node */
  displayName?: string;

  /** Description of the agent/node */
  description?: string;

  /** Icon identifier */
  icon?: string;

  /** Color for UI display */
  color?: string;

  /** Organization slug for scoping */
  organizationSlug?: string;

  /** Node order/priority */
  order?: number;

  /** Visibility flags */
  visibility?: {
    hidden?: boolean;
    collapsed?: boolean;
    featured?: boolean;
  };

  /** Capabilities */
  capabilities?: string[];

  /** Tags for categorization */
  tags?: string[];

  /** Custom metadata fields */
  custom?: Record<string, string | number | boolean>;
}

/**
 * Agent hierarchy node
 * Represents a node in the agent tree structure
 */
export interface HierarchyNode {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** Node type */
  type: 'agent' | 'group' | 'category';

  /** Agent type (for agent nodes) */
  agentType?: string;

  /** Parent node ID */
  parentId?: string | null;

  /** Child nodes */
  children?: HierarchyNode[];

  /** Node level in hierarchy (0 = root) */
  level?: number;

  /** Whether node is expanded in UI */
  expanded?: boolean;

  /** Whether node is selectable */
  selectable?: boolean;

  /** Organization slug for organizational grouping */
  organizationSlug?: string;

  /** Node metadata */
  metadata?: AgentNodeMetadata;

  /** Creation/update timestamps */
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Flat hierarchy data for tree building
 */
export interface FlatHierarchyData {
  id: string;
  name: string;
  type: string;
  agentType?: string | null;
  parentId?: string | null;
  organizationSlug?: string | null;
  metadata?: JsonObject;
  [key: string]: JsonValue | undefined;
}

// =====================================
// AGENT DEFINITIONS
// =====================================

/**
 * Agent capability definition
 */
export interface AgentCapability {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  requiredPermissions?: string[];
}

/**
 * Agent configuration
 */
export interface AgentConfiguration {
  /** Model configuration */
  model?: {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
  };

  /** Available tools */
  tools?: string[];

  /** System prompt */
  systemPrompt?: string;

  /** Context window size */
  contextWindow?: number;

  /** Response preferences */
  responsePreferences?: {
    format?: 'text' | 'json' | 'markdown';
    maxLength?: number;
    style?: string;
  };

  /** Safety settings */
  safety?: {
    contentFilter?: boolean;
    piiDetection?: boolean;
    toxicityFilter?: boolean;
  };

  /** Performance settings */
  performance?: {
    cacheEnabled?: boolean;
    streamingEnabled?: boolean;
    batchEnabled?: boolean;
  };

  /** Custom configuration */
  custom?: Record<string, JsonValue>;
}

/**
 * Agent definition
 */
export interface Agent {
  id: string;
  name: string;
  type: string;
  description?: string;
  status: 'active' | 'inactive' | 'archived';
  organizationSlug?: string;
  capabilities?: AgentCapability[];
  configuration?: AgentConfiguration;
  metadata?: AgentNodeMetadata;
  requireLocalModel?: boolean; // When true, only local LLM providers (Ollama) allowed

  /** Execution capabilities for runtime usage */
  execution_capabilities?: {
    can_converse: boolean;
    can_plan: boolean;
    can_build: boolean;
    requires_human_gate: boolean;
  };

  /** Structure for plan generation */
  plan_structure?: JsonObject | null;

  /** Structure for deliverable generation */
  deliverable_structure?: JsonObject | null;
  createdAt: string;
  updatedAt: string;
}

// Department-based hierarchy (new v2 format)
export interface DepartmentHierarchyData {
  [department: string]: Array<{
    id: string;
    slug: string;
    name: string;
    displayName: string;
    type: string;
    description: string;
    status: string;
    organizationSlug: string;
    tags: string[];
    capabilities: string[];
    execution_modes: string[];
    metadata: Record<string, unknown>;
  }>;
}

export type AgentHierarchyResponse = {
  data?: HierarchyNode[] | DepartmentHierarchyData;
  metadata?: (AgentNodeMetadata & {
    totalAgents?: number;
    totalDepartments?: number;
    departments?: string[];
  }) | null;
} & JsonObject;

// =====================================
// AGENT STATISTICS
// =====================================

/**
 * Agent usage statistics
 */
export interface AgentStatistics {
  agentId: string;
  agentType: string;

  /** Usage counts */
  usage: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    averageTaskDuration: number;
  };

  /** Performance metrics */
  performance: {
    successRate: number;
    averageResponseTime: number;
    qualityScore?: number;
    userSatisfaction?: number;
  };

  /** Resource consumption */
  resources: {
    totalTokens: number;
    totalCost: number;
    averageTokensPerTask: number;
    averageCostPerTask: number;
  };

  /** Time range */
  period: {
    from: string;
    to: string;
  };

  /** Last activity */
  lastActivity?: {
    taskId: string;
    timestamp: string;
    status: string;
  };
}

/**
 * Agent health status
 */
export interface AgentHealthStatus {
  agentId: string;
  agentType: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'offline';
  checks: Array<{
    name: string;
    status: 'pass' | 'warn' | 'fail';
    message?: string;
    timestamp: string;
  }>;
  lastCheckedAt: string;
}

// =====================================
// HIERARCHY OPERATIONS
// =====================================

/**
 * Options for building agent hierarchy
 */
export interface BuildHierarchyOptions {
  /** Maximum depth to traverse */
  maxDepth?: number;

  /** Include metadata in nodes */
  includeMetadata?: boolean;

  /** Filter function for nodes */
  filter?: (node: HierarchyNode) => boolean;

  /** Sort function for children */
  sort?: (a: HierarchyNode, b: HierarchyNode) => number;

  /** Whether to expand all nodes by default */
  expandAll?: boolean;
}

/**
 * Result of hierarchy operations
 */
export interface HierarchyOperationResult {
  success: boolean;
  message?: string;
  affectedNodes?: string[];
  hierarchy?: HierarchyNode;
  errors?: Array<{
    nodeId: string;
    error: string;
  }>;
}

// =====================================
// FILTERING & SORTING
// =====================================

/**
 * Filters for querying agents
 */
export interface AgentFilters {
  type?: string | string[];
  status?: 'active' | 'inactive' | 'archived';
  organizationSlug?: string | string[];
  capabilities?: string[];
  tags?: string[];
  search?: string;
}

/**
 * Sort options for agents
 */
export interface AgentSortOptions {
  field: 'name' | 'type' | 'createdAt' | 'updatedAt' | 'usageCount';
  direction: 'asc' | 'desc';
}

// =====================================
// CREATION PAYLOADS
// =====================================

/**
 * Payload for creating a new agent
 */
export interface CreateAgentPayload {
  name: string;
  type: string;
  description?: string;
  organizationSlug?: string;
  capabilities?: string[];
  configuration?: AgentConfiguration;
  metadata?: AgentNodeMetadata;
}

/**
 * Payload for updating an agent
 */
export interface UpdateAgentPayload {
  name?: string;
  description?: string;
  status?: 'active' | 'inactive' | 'archived';
  organizationSlug?: string;
  capabilities?: string[];
  configuration?: Partial<AgentConfiguration>;
  metadata?: Partial<AgentNodeMetadata>;
}
