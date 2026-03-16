/**
 * Unit Tests for AgentsStore
 *
 * Tests pure state management for agents and hierarchy.
 *
 * Key Testing Areas:
 * - Store initialization (empty state)
 * - setAvailableAgents - normalization of organizationSlug (array -> string)
 * - setAvailableAgents - normalization of hasCustomUI/customUIComponent from metadata
 * - setAvailableAgents - normalization of requireLocalModel from snake_case
 * - setAgentHierarchy - hierarchy state
 * - resetAgents - clearing agent data
 * - Loading and error state management
 * - hasAgents computed property
 * - normalizeHierarchyResponse - flat array and department-grouped formats
 * - filterHierarchyByOrganization - filtering and pruning
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import {
  useAgentsStore,
  normalizeHierarchyResponse,
  filterHierarchyByOrganization,
  filterHierarchyByNamespace,
  type HierarchyNode,
} from '../agentsStore';
import type { AgentInfo } from '@/types/chat';

// ============================================================================
// Helpers
// ============================================================================

function makeAgentInfo(overrides: Partial<AgentInfo> & Record<string, unknown> = {}): AgentInfo {
  return {
    slug: 'test-agent',
    name: 'Test Agent',
    type: 'context',
    organizationSlug: 'test-org',
    hasCustomUI: false,
    customUIComponent: null,
    requireLocalModel: false,
    ...overrides,
  } as AgentInfo;
}

function makeHierarchyNode(overrides: Partial<HierarchyNode> = {}): HierarchyNode {
  return {
    id: 'node-1',
    name: 'Test Node',
    type: 'agent',
    agentType: 'context',
    organizationSlug: 'test-org',
    children: [],
    metadata: {},
    ...overrides,
  };
}

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  setActivePinia(createPinia());
});

// ============================================================================
// Store Initialization
// ============================================================================

describe('Store Initialization', () => {
  it('should initialize with empty available agents', () => {
    const store = useAgentsStore();
    expect(store.availableAgents).toEqual([]);
  });

  it('should initialize with null agent hierarchy', () => {
    const store = useAgentsStore();
    expect(store.agentHierarchy).toBeNull();
  });

  it('should initialize with isLoading = false', () => {
    const store = useAgentsStore();
    expect(store.isLoading).toBe(false);
  });

  it('should initialize with no error', () => {
    const store = useAgentsStore();
    expect(store.error).toBeNull();
  });

  it('should initialize hasAgents as false', () => {
    const store = useAgentsStore();
    expect(store.hasAgents).toBe(false);
  });

  it('should initialize lastLoadedOrganization as null', () => {
    const store = useAgentsStore();
    expect(store.lastLoadedOrganization).toBeNull();
  });
});

// ============================================================================
// setAvailableAgents - Agent Normalization
// ============================================================================

describe('setAvailableAgents', () => {
  it('should set available agents', () => {
    const store = useAgentsStore();
    const agents = [makeAgentInfo({ slug: 'blog-writer', name: 'Blog Writer' })];

    store.setAvailableAgents(agents);

    expect(store.availableAgents).toHaveLength(1);
    expect(store.availableAgents[0].slug).toBe('blog-writer');
  });

  it('should make hasAgents true after setting agents', () => {
    const store = useAgentsStore();
    store.setAvailableAgents([makeAgentInfo()]);

    expect(store.hasAgents).toBe(true);
  });

  it('should normalize organizationSlug from an array to first element', () => {
    const store = useAgentsStore();
    const rawAgent = {
      ...makeAgentInfo(),
      organizationSlug: ['legal', 'global'] as unknown as string,
    };

    store.setAvailableAgents([rawAgent]);

    // Should pick 'legal' (first non-global org)
    expect(store.availableAgents[0].organizationSlug).toBe('legal');
  });

  it('should use the first element of the array when organizationSlug is an array', () => {
    const store = useAgentsStore();
    const rawAgent = {
      ...makeAgentInfo(),
      organizationSlug: ['test-org', 'global'] as unknown as string,
    };

    store.setAvailableAgents([rawAgent]);

    // setAvailableAgents uses [0] (first element), not a preference for non-global
    expect(store.availableAgents[0].organizationSlug).toBe('test-org');
  });

  it('should use first element even when it is global', () => {
    const store = useAgentsStore();
    const rawAgent = {
      ...makeAgentInfo(),
      organizationSlug: ['global', 'test-org'] as unknown as string,
    };

    store.setAvailableAgents([rawAgent]);

    // First element is taken as-is
    expect(store.availableAgents[0].organizationSlug).toBe('global');
  });

  it('should extract hasCustomUI from agent metadata when not top-level', () => {
    const store = useAgentsStore();
    const rawAgent = {
      ...makeAgentInfo({ hasCustomUI: undefined }),
      metadata: { hasCustomUI: true },
    } as unknown as AgentInfo;

    store.setAvailableAgents([rawAgent]);

    expect(store.availableAgents[0].hasCustomUI).toBe(true);
  });

  it('should extract customUIComponent from metadata', () => {
    const store = useAgentsStore();
    const rawAgent = {
      ...makeAgentInfo({ customUIComponent: null }),
      metadata: { customUIComponent: 'PredictionDashboard' },
    } as unknown as AgentInfo;

    store.setAvailableAgents([rawAgent]);

    expect(store.availableAgents[0].customUIComponent).toBe('PredictionDashboard');
  });

  it('should extract requireLocalModel from require_local_model (snake_case)', () => {
    const store = useAgentsStore();
    const rawAgent = {
      ...makeAgentInfo({ requireLocalModel: false }),
      require_local_model: true,
    } as unknown as AgentInfo;

    store.setAvailableAgents([rawAgent]);

    expect(store.availableAgents[0].requireLocalModel).toBe(true);
  });

  it('should default hasCustomUI to false when not in agent or metadata', () => {
    const store = useAgentsStore();
    const rawAgent = makeAgentInfo({ hasCustomUI: undefined });

    store.setAvailableAgents([rawAgent]);

    expect(store.availableAgents[0].hasCustomUI).toBe(false);
  });

  it('should default requireLocalModel to false when absent', () => {
    const store = useAgentsStore();
    store.setAvailableAgents([makeAgentInfo()]);

    expect(store.availableAgents[0].requireLocalModel).toBe(false);
  });
});

// ============================================================================
// setAgentHierarchy
// ============================================================================

describe('setAgentHierarchy', () => {
  it('should set the agent hierarchy', () => {
    const store = useAgentsStore();
    const hierarchy = makeHierarchyNode({ id: 'root', name: 'Root' });

    store.setAgentHierarchy(hierarchy);

    expect(store.agentHierarchy).toEqual(hierarchy);
  });

  it('should set hierarchy to null', () => {
    const store = useAgentsStore();
    store.setAgentHierarchy(makeHierarchyNode());

    store.setAgentHierarchy(null);

    expect(store.agentHierarchy).toBeNull();
  });
});

// ============================================================================
// resetAgents
// ============================================================================

describe('resetAgents', () => {
  it('should clear available agents and hierarchy', () => {
    const store = useAgentsStore();
    store.setAvailableAgents([makeAgentInfo()]);
    store.setAgentHierarchy(makeHierarchyNode());

    store.resetAgents();

    expect(store.availableAgents).toEqual([]);
    expect(store.agentHierarchy).toBeNull();
    expect(store.hasAgents).toBe(false);
  });
});

// ============================================================================
// Loading and Error State
// ============================================================================

describe('Loading and Error State', () => {
  it('should set loading state to true', () => {
    const store = useAgentsStore();
    store.setLoading(true);
    expect(store.isLoading).toBe(true);
  });

  it('should set loading state to false', () => {
    const store = useAgentsStore();
    store.setLoading(true);
    store.setLoading(false);
    expect(store.isLoading).toBe(false);
  });

  it('should set an error message', () => {
    const store = useAgentsStore();
    store.setError('Failed to load agents');
    expect(store.error).toBe('Failed to load agents');
  });

  it('should clear error message', () => {
    const store = useAgentsStore();
    store.setError('Error occurred');
    store.clearError();
    expect(store.error).toBeNull();
  });

  it('should set error to null', () => {
    const store = useAgentsStore();
    store.setError('error');
    store.setError(null);
    expect(store.error).toBeNull();
  });
});

// ============================================================================
// lastLoadedOrganization / Namespace (backward compat alias)
// ============================================================================

describe('lastLoadedOrganization', () => {
  it('should set last loaded organization', () => {
    const store = useAgentsStore();
    store.setLastLoadedOrganization('test-org');
    expect(store.lastLoadedOrganization).toBe('test-org');
  });

  it('should expose lastLoadedNamespace as alias for lastLoadedOrganization', () => {
    const store = useAgentsStore();
    store.setLastLoadedOrganization('my-org');
    expect(store.lastLoadedNamespace).toBe('my-org');
  });

  it('should set via deprecated setLastLoadedNamespace', () => {
    const store = useAgentsStore();
    store.setLastLoadedNamespace('legacy-org');
    expect(store.lastLoadedOrganization).toBe('legacy-org');
  });

  it('should accept null to clear organization', () => {
    const store = useAgentsStore();
    store.setLastLoadedOrganization('org');
    store.setLastLoadedOrganization(null);
    expect(store.lastLoadedOrganization).toBeNull();
  });
});

// ============================================================================
// normalizeHierarchyResponse
// ============================================================================

describe('normalizeHierarchyResponse', () => {
  it('should return empty data for null input', () => {
    const result = normalizeHierarchyResponse(null);
    expect(result.data).toEqual([]);
    expect(result.metadata).toBeNull();
  });

  it('should return empty data for undefined input', () => {
    const result = normalizeHierarchyResponse(undefined);
    expect(result.data).toEqual([]);
  });

  it('should return flat array as-is', () => {
    const nodes = [
      makeHierarchyNode({ id: 'a' }),
      makeHierarchyNode({ id: 'b' }),
    ];

    const result = normalizeHierarchyResponse(nodes);
    expect(result.data).toHaveLength(2);
    expect(result.data[0].id).toBe('a');
  });

  it('should normalize department-grouped format (v2) to flat array', () => {
    const input = {
      data: {
        legal: [
          {
            id: 'legal-agent',
            slug: 'legal-agent',
            name: 'Legal Agent',
            type: 'api',
            organization: 'legal,global',
            displayName: 'Legal Assistant',
            description: 'Handles legal tasks',
            metadata: {},
          },
        ],
        marketing: [
          {
            id: 'marketing-agent',
            slug: 'marketing-agent',
            name: 'Marketing Agent',
            type: 'orchestrator',
            organization: 'marketing',
            displayName: 'Marketing Bot',
            description: 'Marketing workflows',
            metadata: {},
          },
        ],
      },
    };

    const result = normalizeHierarchyResponse(input as never);

    expect(result.data).toHaveLength(2);

    const legalAgent = result.data.find((n) => n.id === 'legal-agent');
    expect(legalAgent).toBeDefined();
    expect(legalAgent?.organizationSlug).toBe('legal'); // first non-global org
    expect(legalAgent?.metadata?.custom).toMatchObject({ department: 'legal' });

    const marketingAgent = result.data.find((n) => n.id === 'marketing-agent');
    expect(marketingAgent).toBeDefined();
    expect(marketingAgent?.organizationSlug).toBe('marketing');
  });

  it('should handle AgentHierarchyResponse with data as flat array', () => {
    const input = {
      data: [makeHierarchyNode({ id: 'flat-node' })],
      metadata: { totalCount: 1 },
    };

    const result = normalizeHierarchyResponse(input as never);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('flat-node');
    expect(result.metadata).toMatchObject({ totalCount: 1 });
  });
});

// ============================================================================
// filterHierarchyByOrganization
// ============================================================================

describe('filterHierarchyByOrganization', () => {
  it('should keep nodes matching the organization', () => {
    const nodes: HierarchyNode[] = [
      makeHierarchyNode({ id: 'legal-node', organizationSlug: 'legal' }),
      makeHierarchyNode({ id: 'marketing-node', organizationSlug: 'marketing' }),
    ];

    const result = filterHierarchyByOrganization(nodes, 'legal');

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('legal-node');
  });

  it('should keep global nodes regardless of org filter', () => {
    const nodes: HierarchyNode[] = [
      makeHierarchyNode({ id: 'global-node', organizationSlug: 'global' }),
      makeHierarchyNode({ id: 'legal-node', organizationSlug: 'legal' }),
    ];

    const result = filterHierarchyByOrganization(nodes, 'marketing');

    expect(result.data.map((n) => n.id)).toContain('global-node');
    expect(result.data.map((n) => n.id)).not.toContain('legal-node');
  });

  it('should keep nodes with no organizationSlug', () => {
    const nodes: HierarchyNode[] = [
      makeHierarchyNode({ id: 'no-org', organizationSlug: undefined }),
      makeHierarchyNode({ id: 'org-node', organizationSlug: 'test-org' }),
    ];

    const result = filterHierarchyByOrganization(nodes, 'other-org');

    // Nodes with no org pass through
    expect(result.data.map((n) => n.id)).toContain('no-org');
    expect(result.data.map((n) => n.id)).not.toContain('org-node');
  });

  it('should prune parent nodes that only have matching children', () => {
    const nodes: HierarchyNode[] = [
      {
        ...makeHierarchyNode({ id: 'parent', organizationSlug: 'other-org' }),
        children: [
          makeHierarchyNode({ id: 'child', organizationSlug: 'test-org' }),
        ],
      },
    ];

    const result = filterHierarchyByOrganization(nodes, 'test-org');

    // Parent is kept because it has matching children
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('parent');
    expect(result.data[0].children).toHaveLength(1);
    expect(result.data[0].children![0].id).toBe('child');
  });

  it('should handle null/undefined hierarchy input', () => {
    const result = filterHierarchyByOrganization(null, 'test-org');
    expect(result.data).toEqual([]);
  });

  it('filterHierarchyByNamespace should be an alias for filterHierarchyByOrganization', () => {
    const nodes: HierarchyNode[] = [
      makeHierarchyNode({ id: 'node-1', organizationSlug: 'ns-org' }),
    ];

    const result = filterHierarchyByNamespace(nodes, 'ns-org');

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('node-1');
  });
});
