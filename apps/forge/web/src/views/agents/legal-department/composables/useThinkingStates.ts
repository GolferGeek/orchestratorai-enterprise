/**
 * useThinkingStates — derives per-stage thinking sub-state from the raw
 * observability event stream.
 *
 * The `agent.llm.thinking_started` / `agent.llm.thinking_completed` events
 * carry `payload.callerName` (e.g. `legal-department:contract-agent`) and are
 * intentionally NOT routed through the manifest-driven `presentationWalker` —
 * they represent a sub-state within an already-active stage and should not
 * trigger stage transitions.
 *
 * This composable scans the raw event list and returns a reactive map from
 * stage id → 'reasoning' | 'writing' | null.  The map is used as an overlay
 * on top of the StageState[] produced by the walker.
 *
 * Mapping logic (callerName → stage id):
 *   legal-department:{key}-agent  → {key}   (e.g. contract-agent → contract)
 *   legal-department:synthesis    → synthesize
 *   legal-department:report-generation → report
 *
 * Lifecycle:
 *   thinking_started  → 'reasoning'
 *   thinking_completed  → 'writing'  (the model has finished thinking and is now outputting)
 *   Any subsequent stage-complete event clears the entry (handled by clearing
 *   entries whose stage is no longer active — the caller manages that).
 *
 * Note: the thinking_completed event does NOT mean the LLM call is done; it
 * means the reasoning phase ended and the model switched to the output phase
 * ("writing").  The stage returns to normal (no overlay) when the stage-complete
 * event fires — which happens via the normal walker path and causes the stage
 * to become 'done'.  At that point the stage row no longer renders the overlay
 * at all because we only show the overlay for 'active' stages.
 */

import { computed, type Ref } from 'vue';
import type { ObservabilityEvent } from '../legalJobsService';
import type { StageState } from '@orchestrator-ai/transport-types';

export type ThinkingPhase = 'reasoning' | 'writing';

/**
 * Map from stage id to the current thinking phase, or undefined/absent when no
 * thinking phase is active for that stage.
 */
export type ThinkingStateMap = Record<string, ThinkingPhase>;

const THINKING_STARTED = 'agent.llm.thinking_started';
const THINKING_COMPLETED = 'agent.llm.thinking_completed';

/**
 * Convert a `callerName` field from a thinking event into the stage id used by
 * the legal-department manifest.
 *
 * callerName format: `legal-department:{specialistKey}` or
 *                    `legal-department:{specialistKey}-agent`
 *
 * Stage id mapping exceptions (where the key doesn't match the stage id 1:1):
 *   synthesis        → synthesize
 *   report-generation → report
 *
 * All 8 specialist keys match their stage ids directly (contract, compliance,
 * corporate, employment, ip, litigation, privacy, real_estate).
 */
function callerNameToStageId(callerName: string): string | null {
  // Strip the 'legal-department:' prefix
  const prefixed = callerName.replace(/^legal-department:/, '');
  // Strip optional '-agent' suffix
  const key = prefixed.replace(/-agent$/, '');

  // Apply the known exceptions
  if (key === 'synthesis') return 'synthesize';
  if (key === 'report-generation') return 'report';
  if (key === 'clause-segmentation') return 'clause-segmentation';

  // For specialist keys that contain a hyphen converted from underscore
  // (real-estate-agent → real_estate), normalise hyphens in the middle to underscores.
  // Stage ids use underscores (real_estate) but callerNames use hyphens (real-estate).
  const normalised = key.replace(/-/g, '_');
  if (normalised !== key) return normalised;

  return key || null;
}

/**
 * Derive a ThinkingStateMap from a reactive events list and a reactive stages
 * list.  Only stages that are currently 'active' can have a thinking overlay;
 * if a stage has already completed (or was never started), its thinking entry
 * is suppressed.
 */
export function useThinkingStates(
  events: Ref<ObservabilityEvent[]>,
  stages: Ref<StageState[]>,
): Ref<ThinkingStateMap> {
  return computed<ThinkingStateMap>(() => {
    // Build a set of currently-active stage ids so we only overlay stages
    // that are actually running.
    const activeIds = new Set(
      stages.value
        .filter((s) => s.state === 'active')
        .map((s) => s.id),
    );

    const map: ThinkingStateMap = {};

    for (const ev of events.value) {
      const hookType = ev.hook_event_type;
      if (hookType !== THINKING_STARTED && hookType !== THINKING_COMPLETED) {
        continue;
      }

      // The callerName is in ev.payload.callerName (set by emitLlmObservabilityEvent
      // in packages/planes/llm/fine-control/llm.service.ts).
      const payload = ev.payload as Record<string, unknown> | null | undefined;
      const callerName =
        typeof payload?.callerName === 'string' ? payload.callerName : null;

      if (!callerName) continue;

      const stageId = callerNameToStageId(callerName);
      if (!stageId) continue;

      // Only set the overlay if the stage is still active.
      if (!activeIds.has(stageId)) continue;

      if (hookType === THINKING_STARTED) {
        // Only set 'reasoning' if we haven't already seen a thinking_completed
        // for this stage (i.e. don't regress from 'writing' back to 'reasoning').
        if (map[stageId] !== 'writing') {
          map[stageId] = 'reasoning';
        }
      } else {
        // thinking_completed → transition to 'writing' (model now outputting)
        map[stageId] = 'writing';
      }
    }

    return map;
  });
}
