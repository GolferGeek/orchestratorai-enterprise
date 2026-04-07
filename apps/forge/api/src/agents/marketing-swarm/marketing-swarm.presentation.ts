/**
 * MarketingSwarmPresentation — the user-facing stage manifest for the
 * Marketing Swarm workflow.
 *
 * Colocated with the graph and the service so the team that owns the
 * workflow also owns the words the user reads. Edit this file to rename
 * a phase, change a description, or add a new phase.
 *
 * The walker (in @orchestrator-ai/transport-types) consumes this manifest
 * to turn the graph's `phase_changed` observability events into a stage
 * ladder for the in-row ticker and the modal events tab.
 *
 * The marketing-swarm graph emits a `phase_changed` event whose
 * `metadata.phase` field carries the current phase name. We start each
 * stage when its phase appears, and complete it when the next phase
 * appears (or when `completed` arrives, which closes everything).
 *
 * Reference: docs/efforts/archive/legal-workspace-review-ux/prd.md §4.1
 * Followup: docs/efforts/future/legal-async-workspace-followups.md §11
 */
import type { WorkflowPresentation } from '@orchestrator-ai/transport-types';

export const MARKETING_SWARM_PRESENTATION: WorkflowPresentation = {
  agentSlug: 'marketing-swarm',
  version: '2026-04-07.1',

  // Six top-level stages mirroring the graph's phase machine.
  stages: [
    {
      id: 'setup',
      label: 'Setting up the run',
      description:
        'Building the execution queue: writers, editors, and evaluators.',
    },
    {
      id: 'writing',
      label: 'Writers drafting',
      description:
        'Each writer agent generates an initial draft from the brief.',
    },
    {
      id: 'editing',
      label: 'Editors reviewing',
      description:
        'Editor agents review each draft and approve or request changes.',
    },
    {
      id: 'evaluating',
      label: 'Evaluators scoring',
      description:
        'Evaluator agents score every output on quality, fit, and tone.',
    },
    {
      id: 'ranking',
      label: 'Ranking the results',
      description:
        'Averaging evaluator scores and picking the top-ranked finalist.',
    },
    {
      id: 'completed',
      label: 'Run complete',
      description: 'Finalists are selected and the swarm has finished.',
    },
  ],

  // Hide low-level instrumentation. Users see phase transitions, not
  // individual LLM calls or per-step output mutations.
  suppress: [
    { hookEventType: 'agent.llm.started' },
    { hookEventType: 'agent.llm.completed' },
    { hookEventType: 'agent.llm.failed' },
    // Per-output mutation events fire many times per phase and would
    // drown out the high-level phase ladder. The detail panel can still
    // surface them via the "Show raw events (debug)" toggle.
    { step: 'output_updated' },
    { step: 'evaluation_updated' },
    { step: 'ranking_updated' },
    { step: 'finalists_selected' },
    { step: 'queue_built' },
  ],

  // Map raw observability events onto stage transitions. The graph emits
  // `phase_changed` whenever it moves to a new phase; we use that single
  // step name plus the `metadata.phase` payload to drive every stage.
  rules: [
    // Setup
    {
      stage: 'setup',
      match: {
        step: 'phase_changed',
        payloadEquals: { 'payload/data/phase': 'setup' },
      },
      kind: 'start',
    },
    {
      stage: 'setup',
      match: {
        step: 'phase_changed',
        payloadEquals: { 'payload/data/phase': 'writing' },
      },
      kind: 'complete',
    },

    // Writing
    {
      stage: 'writing',
      match: {
        step: 'phase_changed',
        payloadEquals: { 'payload/data/phase': 'writing' },
      },
      kind: 'start',
    },
    {
      stage: 'writing',
      match: {
        step: 'phase_changed',
        payloadEquals: { 'payload/data/phase': 'editing' },
      },
      kind: 'complete',
    },
    // Skip-forward: when there are no editors, the graph jumps straight
    // from writing → evaluating, so 'editing' is never seen. Close the
    // writing stage on either transition.
    {
      stage: 'writing',
      match: {
        step: 'phase_changed',
        payloadEquals: { 'payload/data/phase': 'evaluating' },
      },
      kind: 'complete',
    },

    // Editing
    {
      stage: 'editing',
      match: {
        step: 'phase_changed',
        payloadEquals: { 'payload/data/phase': 'editing' },
      },
      kind: 'start',
    },
    {
      stage: 'editing',
      match: {
        step: 'phase_changed',
        payloadEquals: { 'payload/data/phase': 'evaluating' },
      },
      kind: 'complete',
    },

    // Evaluating
    {
      stage: 'evaluating',
      match: {
        step: 'phase_changed',
        payloadEquals: { 'payload/data/phase': 'evaluating' },
      },
      kind: 'start',
    },
    {
      stage: 'evaluating',
      match: {
        step: 'phase_changed',
        payloadEquals: { 'payload/data/phase': 'ranking' },
      },
      kind: 'complete',
    },

    // Ranking
    {
      stage: 'ranking',
      match: {
        step: 'phase_changed',
        payloadEquals: { 'payload/data/phase': 'ranking' },
      },
      kind: 'start',
    },
    {
      stage: 'ranking',
      match: {
        step: 'phase_changed',
        payloadEquals: { 'payload/data/phase': 'completed' },
      },
      kind: 'complete',
    },

    // Completed — start + complete on the same event so the final ✓
    // appears immediately when the swarm finishes.
    {
      stage: 'completed',
      match: {
        step: 'phase_changed',
        payloadEquals: { 'payload/data/phase': 'completed' },
      },
      kind: 'start',
    },
    {
      stage: 'completed',
      match: {
        step: 'phase_changed',
        payloadEquals: { 'payload/data/phase': 'completed' },
      },
      kind: 'complete',
    },
  ],
};
