/**
 * useWorkflowPresentation — fetches the per-workflow presentation
 * manifest from `GET /agents/:slug/presentation` once per session and
 * exposes a reactive `stagesFromEvents(events)` helper that runs the
 * walker.
 *
 * Manifests are immutable compile-time data on the server, so we cache
 * them in module-scoped maps keyed by agent_slug. The composable also
 * gracefully handles 404s (the agent has no manifest yet) by exposing
 * `manifest === null` so callers can render a raw-events fallback.
 */
import { computed, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue';
import {
  presentationWalker,
  type PresentationEvent,
  type StageState,
  type WorkflowPresentation,
} from '@orchestrator-ai/transport-types';

const FORGE_API_URL =
  (import.meta as { env: { VITE_FORGE_API_URL?: string } }).env
    .VITE_FORGE_API_URL ||
  (import.meta as { env: { VITE_API_BASE_URL?: string } }).env
    .VITE_API_BASE_URL || '/api/forge';

// Module-scoped cache: one fetched manifest per agent_slug per session.
const manifestCache = new Map<string, Promise<WorkflowPresentation | null>>();

async function fetchManifest(
  agentSlug: string,
  capabilitySlug?: string,
): Promise<WorkflowPresentation | null> {
  const token = localStorage.getItem('authToken');
  const url = new URL(
    `${FORGE_API_URL}/agents/${encodeURIComponent(agentSlug)}/presentation`,
    window.location.origin,
  );
  if (capabilitySlug) {
    url.searchParams.set('capability', capabilitySlug);
  }
  const res = await fetch(
    url.pathname + url.search,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(
      `Failed to fetch presentation for ${agentSlug}: ${res.status} ${res.statusText}`,
    );
  }
  return (await res.json()) as WorkflowPresentation;
}

export interface UseWorkflowPresentationResult {
  manifest: Ref<WorkflowPresentation | null>;
  loading: Ref<boolean>;
  /**
   * Walk the given events through the loaded manifest. Returns an
   * empty array if the manifest hasn't loaded yet OR if the agent has
   * no manifest registered (caller should fall back to raw events).
   */
  stagesFromEvents: (events: PresentationEvent[]) => StageState[];
}

export function useWorkflowPresentation(
  agentSlug: string,
  capabilitySlug?: MaybeRefOrGetter<string | undefined>,
): UseWorkflowPresentationResult {
  const manifest = ref<WorkflowPresentation | null>(null);
  const loading = ref(true);
  const resolvedCapability = computed(() => toValue(capabilitySlug));

  watch(
    resolvedCapability,
    async (capability) => {
      loading.value = true;
      const cacheKey = capability ? `${agentSlug}/${capability}` : agentSlug;
      let promise = manifestCache.get(cacheKey);
      if (!promise) {
        promise = fetchManifest(agentSlug, capability).catch((err) => {
          console.error(
            `[useWorkflowPresentation] failed to load manifest for ${cacheKey}:`,
            err instanceof Error ? err.message : String(err),
          );
          return null;
        });
        manifestCache.set(cacheKey, promise);
      }

      manifest.value = await promise;
      loading.value = false;
    },
    { immediate: true },
  );

  function stagesFromEvents(events: PresentationEvent[]): StageState[] {
    if (!manifest.value) return [];
    return presentationWalker(manifest.value, events);
  }

  return { manifest, loading, stagesFromEvents };
}
