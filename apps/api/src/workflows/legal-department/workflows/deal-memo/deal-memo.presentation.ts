import type { WorkflowPresentation } from '@orchestrator-ai/transport-types';

export const DEAL_MEMO_PRESENTATION: WorkflowPresentation = {
  agentSlug: 'legal-department',
  version: '2026-04-23.1',

  stages: [
    {
      id: 'intake',
      label: 'Hydrating diligence context',
      description:
        'Loading the source diligence room, document index, risk matrix, and supporting deal context.',
    },
    {
      id: 'section_drafting',
      label: 'Drafting memo sections',
      description:
        'Drafting the core memo sections from the diligence findings with validated citations.',
    },
    {
      id: 'synthesis',
      label: 'Synthesizing deal memo',
      description:
        'Stitching the drafted sections into a single memo with appendices and references.',
    },
    {
      id: 'hitl_review',
      label: 'Awaiting memo review',
      description:
        'Pausing for attorney review to approve, reject, or directly modify the memo.',
    },
    {
      id: 'finalize',
      label: 'Finalizing memo',
      description:
        'Applying the final decision and preparing the completed memo artifacts.',
    },
  ],

  suppress: [
    { hookEventType: 'agent.llm.started' },
    { hookEventType: 'agent.llm.completed' },
    { hookEventType: 'agent.llm.failed' },
  ],

  rules: [
    { stage: 'intake', match: { step: 'memo_intake' }, kind: 'start' },
    {
      stage: 'intake',
      match: { step: 'section_reps_warranties' },
      kind: 'complete',
    },

    {
      stage: 'section_drafting',
      match: { step: 'section_reps_warranties' },
      kind: 'start',
    },
    { stage: 'section_drafting', match: { step: 'section_indemnification' } },
    {
      stage: 'section_drafting',
      match: { step: 'section_disclosure_schedules' },
    },
    {
      stage: 'section_drafting',
      match: { step: 'section_conditions_precedent' },
    },
    { stage: 'section_drafting', match: { step: 'section_covenants' } },
    {
      stage: 'section_drafting',
      match: { step: 'memo_synthesis' },
      kind: 'complete',
    },

    { stage: 'synthesis', match: { step: 'memo_synthesis' }, kind: 'start' },
    {
      stage: 'synthesis',
      match: { step: 'memo_hitl_gate' },
      kind: 'complete',
    },

    {
      stage: 'hitl_review',
      match: { step: 'memo_hitl_gate' },
      kind: 'start',
    },
    {
      stage: 'hitl_review',
      match: { step: 'apply_review_decision' },
      kind: 'complete',
    },

    {
      stage: 'finalize',
      match: { step: 'memo_finalize' },
      kind: 'start',
    },
    { stage: 'finalize', match: { step: 'complete' }, kind: 'complete' },
  ],
};
