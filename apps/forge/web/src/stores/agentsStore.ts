/**
 * Agents Store - State + Synchronous Mutations Only
 *
 * Phase 4.2 Refactoring: Removed all async methods
 * Use agentsService for API calls
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { AgentInfo } from '../types/chat';
import type { HierarchyNode, AgentNodeMetadata, AgentHierarchyResponse } from '@/types/agent';
import type { JsonObject } from '@orchestrator-ai/transport-types';

interface NormalizedHierarchyResponse {
  data: HierarchyNode[];
  metadata?: AgentNodeMetadata | null;
  rest: JsonObject;
}

// Re-export for backward compatibility
export type { HierarchyNode, AgentNodeMetadata };

export function normalizeHierarchyResponse(input: HierarchyNode[] | AgentHierarchyResponse | null | undefined): NormalizedHierarchyResponse {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const { data, metadata, ...rest } = input as AgentHierarchyResponse;

    // Handle department-grouped format (v2)
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      // Convert department object to flat array
      const flatAgents: HierarchyNode[] = [];
      for (const department in data) {
        const departmentAgents = data[department];
        if (Array.isArray(departmentAgents)) {
          flatAgents.push(...departmentAgents.map((agent: Record<string, unknown>): HierarchyNode => {
            // API returns 'organization' as comma-separated string (e.g., "legal,global")
            // Extract the first non-global org, or fall back to first org
            const orgRaw = agent.organization || agent.organizationSlug;
            let organizationSlug: string | undefined;
            if (typeof orgRaw === 'string') {
              const orgs = orgRaw.split(',').map(s => s.trim()).filter(Boolean);
              // Prefer first non-global org
              organizationSlug = orgs.find(o => o !== 'global') || orgs[0];
            } else if (Array.isArray(orgRaw)) {
              organizationSlug = (orgRaw as string[]).find(o => o !== 'global') || orgRaw[0];
            } else {
              organizationSlug = orgRaw as string | undefined;
            }

            return {
              id: (agent.id || agent.slug) as string,
              name: (agent.slug || agent.name) as string,
              type: 'agent' as const, // HierarchyNode type (not agentType)
              agentType: agent.type as string,
              organizationSlug: organizationSlug as string | undefined,
              metadata: {
                ...(typeof agent.metadata === 'object' && agent.metadata !== null ? agent.metadata as Record<string, unknown> : {}),
                displayName: (agent.displayName || agent.name) as string | undefined,
                description: agent.description as string | undefined,
                custom: {
                  ...(typeof agent.metadata === 'object' && agent.metadata !== null && (agent.metadata as Record<string, unknown>).custom ? (agent.metadata as Record<string, unknown>).custom as Record<string, string | number | boolean> : {}),
                  department,
                },
              },
              children: [],
            };
          }));
        }
      }
      return {
        data: flatAgents,
        metadata: metadata ?? null,
        rest: rest as JsonObject,
      };
    }

    return {
      data: Array.isArray(data) ? data : [],
      metadata: metadata ?? null,
      rest: rest as JsonObject,
    };
  }

  return {
    data: Array.isArray(input) ? input : [],
    metadata: null,
    rest: {},
  };
}

export function filterHierarchyByOrganization(
  hierarchy: HierarchyNode[] | AgentHierarchyResponse | null | undefined,
  organization: string,
) {
  const { data, metadata, rest } = normalizeHierarchyResponse(hierarchy);

  const prune = (tree: HierarchyNode[]): HierarchyNode[] => {
    const result: HierarchyNode[] = [];

    for (const node of tree) {
      const children = Array.isArray(node.children) ? prune(node.children) : [];
      // organizationSlug may be an array from API - extract first element
      const orgSlugRaw = node.organizationSlug || node.metadata?.organizationSlug;
      const nodeOrganization = Array.isArray(orgSlugRaw) ? orgSlugRaw[0] : orgSlugRaw;

      const matchesOrganization =
        !nodeOrganization || nodeOrganization === organization || nodeOrganization === 'global' || children.length > 0;

      if (matchesOrganization) {
        result.push({ ...node, children });
      }
    }

    return result;
  };

  const filtered = prune(data);

  return {
    data: filtered,
    metadata,
    ...rest,
  };
}

// Alias for backward compatibility
export const filterHierarchyByNamespace = filterHierarchyByOrganization;

export const useAgentsStore = defineStore('agents', () => {
  // ============================================================================
  // STATE
  // ============================================================================

  const availableAgents = ref<AgentInfo[]>([]);
  const agentHierarchy = ref<HierarchyNode | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const lastLoadedOrganization = ref<string | null>(null);

  // ============================================================================
  // COMPUTED / GETTERS
  // ============================================================================

  const hasAgents = computed(() => availableAgents.value.length > 0);

  // ============================================================================
  // MUTATIONS (Synchronous Only)
  // ============================================================================

  function setLoading(loading: boolean) {
    isLoading.value = loading;
  }

  function setError(errorMessage: string | null) {
    error.value = errorMessage;
  }

  function setAvailableAgents(agents: AgentInfo[]) {
    // Transform agents to extract hasCustomUI and customUIComponent from metadata
    // This ensures the custom UI fields are available at the top level of AgentInfo
    // Also normalize organizationSlug from array to string (API may return array)
    availableAgents.value = agents.map((agent) => {
      const rawAgent = agent as unknown as Record<string, unknown>;
      const metadata = rawAgent.metadata as Record<string, unknown> | undefined;

      // Handle organizationSlug - API returns array, normalize to first element
      const orgSlugRaw = rawAgent.organizationSlug ?? rawAgent.organization_slug;
      const organizationSlug = Array.isArray(orgSlugRaw) ? orgSlugRaw[0] : orgSlugRaw;

      // Extract require_local_model from API response (snake_case) to requireLocalModel (camelCase)
      const requireLocalModel = rawAgent.require_local_model ?? metadata?.require_local_model ?? false;

      return {
        ...agent,
        organizationSlug: organizationSlug as string | null,
        hasCustomUI: agent.hasCustomUI ?? metadata?.hasCustomUI ?? false,
        customUIComponent: agent.customUIComponent ?? metadata?.customUIComponent ?? null,
        requireLocalModel: requireLocalModel as boolean,
      } as AgentInfo;
    });
  }

  function setAgentHierarchy(hierarchy: HierarchyNode | null) {
    agentHierarchy.value = hierarchy;
  }

  function setLastLoadedOrganization(organization: string | null) {
    lastLoadedOrganization.value = organization;
  }

  // @deprecated Use setLastLoadedOrganization instead
  function setLastLoadedNamespace(organizationSlug: string | null) {
    lastLoadedOrganization.value = organizationSlug;
  }

  function resetAgents() {
    availableAgents.value = [];
    agentHierarchy.value = null;
  }

  function clearError() {
    error.value = null;
  }

  // ============================================================================
  // RETURN (Public API)
  // ============================================================================

  return {
    // State (computed)
    availableAgents,
    agentHierarchy,
    isLoading,
    error,
    hasAgents,
    lastLoadedOrganization,
    lastLoadedNamespace: lastLoadedOrganization, // Alias for backward compatibility

    // Mutations
    setLoading,
    setError,
    clearError,
    setAvailableAgents,
    setAgentHierarchy,
    setLastLoadedOrganization,
    setLastLoadedNamespace, // Alias for backward compatibility
    resetAgents,
  };
});
