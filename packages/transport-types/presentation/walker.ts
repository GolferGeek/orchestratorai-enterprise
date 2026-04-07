/**
 * presentationWalker — applies a WorkflowPresentation manifest to a stream
 * of observability events and returns the resulting StageState[].
 *
 * This is pure data → data. It has no DOM, no network, no LLM calls.
 * Both the Forge API and Forge Web import it from
 * `@orchestrator-ai/transport-types`.
 *
 * Algorithm:
 *   1. Initialize stage states from the manifest. Conditional stages
 *      start hidden until an activator promotes them.
 *   2. Walk events in order. For each event:
 *      a. Drop it if any suppress rule matches.
 *      b. Run all activator rules — promote any conditional stages
 *         they reference into the visible set.
 *      c. Run all event rules — advance matching stages.
 *   3. After all events: any remaining `active` stages stay `active`
 *      (job is still running). Any conditional stages still hidden
 *      become `skipped`.
 *
 * The walker treats event order as authoritative — it does NOT try to
 * reorder events by timestamp. Callers should pass events in
 * chronological order (which is what both the history endpoint and the
 * SSE stream produce naturally).
 */
import type {
  ActivatorRule,
  EventMatch,
  EventRule,
  PresentationEvent,
  StageState,
  SuppressRule,
  WorkflowPresentation,
} from './workflow-presentation';

/** Internal state during walk. */
interface WalkerState {
  // Stage id → mutable state
  stages: Map<string, StageState>;
  // Conditional stage ids that have been activated by an activator rule
  activated: Set<string>;
  // Original ordering from manifest
  order: string[];
  // Quick lookup for which stages are conditional
  conditional: Set<string>;
}

export function presentationWalker(
  manifest: WorkflowPresentation,
  events: PresentationEvent[],
): StageState[] {
  const state = initState(manifest);

  for (const event of events) {
    if (matchesAnySuppress(event, manifest.suppress ?? [])) continue;
    runActivators(event, manifest.activators ?? [], state);
    runRules(event, manifest.rules ?? [], state);
  }

  // Finalize: conditional stages that never activated become skipped.
  for (const id of state.conditional) {
    if (!state.activated.has(id)) {
      const s = state.stages.get(id);
      if (s && s.state === 'pending') s.state = 'skipped';
    }
  }

  // Return in manifest order, including only stages that are visible:
  // - Always include non-conditional stages
  // - Include conditional stages that activated (regardless of final state)
  // - Include conditional stages that ended `skipped` so the user can
  //   see what was considered but skipped
  const result: StageState[] = [];
  for (const id of state.order) {
    const s = state.stages.get(id);
    if (!s) continue;
    if (state.conditional.has(id) && !state.activated.has(id)) {
      // Skipped conditional — include it
      result.push(s);
    } else {
      result.push(s);
    }
  }
  return result;
}

function initState(manifest: WorkflowPresentation): WalkerState {
  const stages = new Map<string, StageState>();
  const order: string[] = [];
  const conditional = new Set<string>();

  for (const def of manifest.stages) {
    stages.set(def.id, {
      id: def.id,
      label: def.label,
      description: def.description,
      state: 'pending',
    });
    order.push(def.id);
    if (def.conditional) conditional.add(def.id);
  }

  return {
    stages,
    activated: new Set<string>(),
    order,
    conditional,
  };
}

function matchesEvent(event: PresentationEvent, match: EventMatch): boolean {
  if (match.hookEventType && event.hook_event_type !== match.hookEventType) {
    return false;
  }
  if (match.step && event.step !== match.step) return false;
  if (match.stepPrefix) {
    if (!event.step || !event.step.startsWith(match.stepPrefix)) return false;
  }
  // At least one field must be set, otherwise the rule matches everything
  // and the manifest author probably made a mistake.
  if (!match.hookEventType && !match.step && !match.stepPrefix) return false;
  return true;
}

function matchesAnySuppress(
  event: PresentationEvent,
  rules: SuppressRule[],
): boolean {
  for (const rule of rules) {
    if (matchesEvent(event, rule)) return true;
  }
  return false;
}

function runActivators(
  event: PresentationEvent,
  rules: ActivatorRule[],
  state: WalkerState,
): void {
  for (const rule of rules) {
    if (!matchesEvent(event, rule.match)) continue;

    const ids: string[] = [];
    if (rule.activatesStageIds) {
      ids.push(...rule.activatesStageIds);
    }
    if (rule.fromPayloadPath) {
      const fromPayload = readPayloadPath(event, rule.fromPayloadPath);
      if (Array.isArray(fromPayload)) {
        for (const v of fromPayload) {
          if (typeof v === 'string') ids.push(v);
        }
      }
    }

    for (const id of ids) {
      if (state.stages.has(id) && state.conditional.has(id)) {
        state.activated.add(id);
      }
    }
  }
}

function runRules(
  event: PresentationEvent,
  rules: EventRule[],
  state: WalkerState,
): void {
  for (const rule of rules) {
    if (!matchesEvent(event, rule.match)) continue;

    const stage = state.stages.get(rule.stage);
    if (!stage) continue;
    // Don't advance conditional stages until they've been activated.
    if (state.conditional.has(stage.id) && !state.activated.has(stage.id)) {
      continue;
    }

    // Failure events ALWAYS win over the rule's declared kind. If the
    // event's hook_event_type ends in `.failed` (or `.error`), the
    // matching stage is marked failed regardless of whether the rule
    // claimed it as a `complete`. Manifest authors don't need to add
    // explicit fail rules for every stage.
    const eventIsFailure = isFailureEvent(event);
    const kind = eventIsFailure ? 'fail' : rule.kind ?? inferKind(event);
    const ts = eventTimestamp(event);

    if (kind === 'fail') {
      stage.state = 'failed';
      stage.errorMessage = event.message ?? stage.errorMessage;
      if (ts && !stage.startedAt) stage.startedAt = ts;
      if (ts) stage.completedAt = ts;
      continue;
    }

    if (kind === 'start' || kind === 'progress') {
      // Only promote pending → active. Don't demote done back to active.
      if (stage.state === 'pending') {
        stage.state = 'active';
        if (ts) stage.startedAt = ts;
      }
      continue;
    }

    if (kind === 'complete') {
      stage.state = 'done';
      if (ts && !stage.startedAt) stage.startedAt = ts;
      if (ts) stage.completedAt = ts;
      continue;
    }
  }
}

/**
 * Heuristic for when a rule doesn't specify `kind`. Used so manifest
 * authors can write minimal rules and let the walker do the obvious.
 */
function inferKind(event: PresentationEvent): EventRule['kind'] {
  const hook = event.hook_event_type ?? '';
  const step = event.step ?? '';
  if (hook.endsWith('.failed') || step.endsWith('_failed')) return 'fail';
  if (hook.endsWith('.completed') || step.endsWith('_complete')) return 'complete';
  return 'progress';
}

function isFailureEvent(event: PresentationEvent): boolean {
  const hook = event.hook_event_type ?? '';
  return hook.endsWith('.failed') || hook.endsWith('.error');
}

function eventTimestamp(event: PresentationEvent): string | undefined {
  if (event.created_at) return event.created_at;
  if (typeof event.timestamp === 'number') {
    return new Date(event.timestamp).toISOString();
  }
  return undefined;
}

function readPayloadPath(
  event: PresentationEvent,
  path: string,
): unknown {
  // Slash-separated path: payload/data/selectedSpecialists
  const parts = path.split('/').filter((p) => p.length > 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursor: any = event as unknown;
  for (const part of parts) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    cursor = cursor[part];
  }
  return cursor;
}
