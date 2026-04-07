/**
 * WorkflowPresentation — per-workflow declarative manifest that maps raw
 * observability events onto a human-readable stage ladder.
 *
 * Each workflow (Legal Department, Marketing Swarm, future Financial /
 * Manufacturing departments) ships its own manifest colocated with its
 * graph. The UI fetches the manifest once per agent_slug and walks each
 * job's events through it to produce a `StageState[]` that renders as a
 * checked-off ladder of pending/active/done/skipped/failed stages.
 *
 * Manifests are pure JSON-serializable data — no closures, no class
 * instances. The walker (`presentationWalker`) is the only piece of code
 * that interprets them.
 *
 * See: docs/efforts/current/prd.md §4.1 + §8 Phase 2
 */

/**
 * One stage in the user-facing checklist. Stages render in the order
 * they appear in the manifest's `stages` array.
 *
 * Conditional stages (e.g. specialist legal agents that only run when the
 * CLO routes to them) are declared with `conditional: true` and a
 * `requires` identifier. They start as `pending` until an activator rule
 * fires for them; if no activator fires by the time the workflow ends,
 * they end up `skipped`.
 */
export interface StageDefinition {
  /** Stable identifier used by rules and activators to reference this stage. */
  id: string;
  /** Human-readable label rendered in the UI ladder. */
  label: string;
  /**
   * Optional longer description shown in tooltips or expanded views.
   * Keep it short — one sentence.
   */
  description?: string;
  /**
   * If true, the stage is hidden from the ladder until an activator rule
   * marks it as a planned stage. Used for branching workflows where the
   * specific specialists run depends on the document.
   */
  conditional?: boolean;
  /**
   * Identifier the activator references when declaring which conditional
   * stages should be promoted to "planned". Optional — defaults to `id`.
   */
  requires?: string;
}

/**
 * A pattern for matching raw observability events. All matchers are AND'ed.
 * `step` matches the event's `step` field exactly. `stepPrefix` matches a
 * prefix (useful for grouping `contract_agent`, `contract_agent_llm_call`,
 * `contract_agent_complete` under one stage). `hookEventType` matches the
 * event's `hook_event_type` field exactly.
 */
export interface EventMatch {
  step?: string;
  stepPrefix?: string;
  hookEventType?: string;
}

/**
 * Map an observability event onto a stage. When an event matches, the
 * stage transitions toward `done` (or to `failed` if the event itself is
 * a failure event). The `kind` field tells the walker which transition.
 */
export interface EventRule {
  /** Stage id this rule advances. */
  stage: string;
  /** Pattern that selects which events trigger this rule. */
  match: EventMatch;
  /**
   * What this event does to the stage:
   * - `start`   → mark stage as `active`
   * - `progress`→ keep stage `active`, optionally update sublabel
   * - `complete`→ mark stage as `done`
   * - `fail`    → mark stage as `failed` and capture the message
   *
   * Defaults to `progress` if omitted, but the walker also auto-starts a
   * stage on first match and auto-completes when an obvious complete
   * event arrives. Explicit kinds give finer control.
   */
  kind?: 'start' | 'progress' | 'complete' | 'fail';
}

/**
 * Activator rules promote conditional stages from hidden to planned.
 * Used for branching workflows where the set of stages isn't known until
 * a routing decision fires.
 *
 * The walker reads `activatesStageIds` if it's a static array, or pulls
 * the list from a payload path (`fromPayloadPath`) at activation time —
 * for example, the legal CLO emits a `clo_routing_complete` event whose
 * `payload.data.selectedSpecialists` is an array of slugs that map to
 * conditional stage ids.
 */
export interface ActivatorRule {
  /** Pattern that selects which event triggers this activator. */
  match: EventMatch;
  /** Static list of stage ids to promote. */
  activatesStageIds?: string[];
  /**
   * Path into the matched event from which to read the list of stage
   * ids to promote. Slash-separated, e.g. `payload/data/selectedSpecialists`.
   */
  fromPayloadPath?: string;
}

/**
 * Filter rule — events matching any suppress rule are dropped before any
 * other rule runs. Use to hide low-level instrumentation
 * (`agent.llm.started`, `agent.llm.completed`, orchestrator bookkeeping)
 * that the user doesn't need to see.
 */
export interface SuppressRule {
  hookEventType?: string;
  step?: string;
  stepPrefix?: string;
}

/**
 * The full presentation manifest for one workflow. JSON-serializable.
 */
export interface WorkflowPresentation {
  /** The agent_slug this manifest applies to (e.g. 'legal-department'). */
  agentSlug: string;
  /** Optional human-friendly version label. */
  version?: string;
  /** Ordered list of stages the user will see (some may be conditional). */
  stages: StageDefinition[];
  /** Filter rules — applied first, drop events that match. */
  suppress?: SuppressRule[];
  /** Activator rules — promote conditional stages when their trigger fires. */
  activators?: ActivatorRule[];
  /** Event rules — advance stages as matching events arrive. */
  rules: EventRule[];
}

/**
 * Runtime state of one stage as the walker processes events.
 */
export interface StageState {
  id: string;
  label: string;
  description?: string;
  state: 'pending' | 'active' | 'done' | 'skipped' | 'failed';
  /** ISO timestamp of the first event that started this stage. */
  startedAt?: string;
  /** ISO timestamp of the event that completed/failed this stage. */
  completedAt?: string;
  /** Error message captured from a failed event, if any. */
  errorMessage?: string;
}

/**
 * Minimal observability event shape the walker consumes. Both the DB
 * history endpoint and the live SSE stream produce events that conform
 * to this — both have `hook_event_type` and `step`, the only fields the
 * walker actually needs to match against. Timestamp fields are used for
 * `startedAt`/`completedAt` annotations.
 */
export interface PresentationEvent {
  hook_event_type?: string | null;
  step?: string | null;
  message?: string | null;
  /** ISO string from DB rows. */
  created_at?: string | null;
  /** Unix ms from in-memory SSE events. */
  timestamp?: number | null;
  payload?: unknown;
}
