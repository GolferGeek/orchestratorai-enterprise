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
import { ref, type Ref } from 'vue';
import {
  presentationWalker,
  type PresentationEvent,
  type StageState,
  type WorkflowPresentation,
} from '@orchestrator-ai/transport-types';

const FORGE_API_URL =
  (import.meta as { env: { VITE_FORGE_API_URL?: string } }).env
    .VITE_FORGE_API_URL || 'http://localhost:5200';

// Module-scoped cache: one fetched manifest per agent_slug per session.
const manifestCache = new Map<string, Promise<WorkflowPresentation | null>>();

async function fetchManifest(
  agentSlug: string,
): Promise<WorkflowPresentation | null> {
  const res = await fetch(
    `${FORGE_API_URL}/agents/${encodeURIComponent(agentSlug)}/presentation`,
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
): UseWorkflowPresentationResult {
  const manifest = ref<WorkflowPresentation | null>(null);
  const loading = ref(true);

  let promise = manifestCache.get(agentSlug);
  if (!promise) {
    promise = fetchManifest(agentSlug).catch((err) => {
      console.error(
        `[useWorkflowPresentation] failed to load manifest for ${agentSlug}:`,
        err instanceof Error ? err.message : String(err),
      );
      return null;
    });
    manifestCache.set(agentSlug, promise);
  }

  void promise.then((m) => {
    manifest.value = m;
    loading.value = false;
  });

  function stagesFromEvents(events: PresentationEvent[]): StageState[] {
    if (!manifest.value) return [];
    return presentationWalker(manifest.value, events);
  }

  return { manifest, loading, stagesFromEvents };
}
