import type { WorkflowPresentation } from '@orchestrator-ai/transport-types';

export const DUE_DILIGENCE_PRESENTATION: WorkflowPresentation = {
  agentSlug: 'legal-department',
  version: '2026-04-23.1',

  stages: [
    {
      id: 'intake',
      label: 'Initializing diligence room',
      description:
        'Capturing deal context, intake metadata, and preparing the diligence room.',
    },
    {
      id: 'classification',
      label: 'Classifying room documents',
      description:
        'Classifying uploaded materials and routing them to the correct legal and financial specialists.',
    },
    {
      id: 'analysis',
      label: 'Analyzing documents',
      description:
        'Running specialist review across the deal room and building the document-level findings.',
    },
    {
      id: 'hitl_gate_1',
      label: 'Awaiting analysis review',
      description:
        'Pausing for the first attorney checkpoint to confirm document classifications and early findings.',
    },
    {
      id: 'synthesis',
      label: 'Synthesizing room findings',
      description:
        'Combining cross-document issues into a room-level risk matrix and deal-breaker view.',
    },
    {
      id: 'hitl_gate_2',
      label: 'Awaiting synthesis review',
      description:
        'Pausing for the final attorney checkpoint before report generation.',
    },
    {
      id: 'report',
      label: 'Generating diligence report',
      description:
        'Writing the final diligence report, risk matrix, and supporting outputs.',
    },
  ],

  suppress: [
    { hookEventType: 'agent.llm.started' },
    { hookEventType: 'agent.llm.completed' },
    { hookEventType: 'agent.llm.failed' },
  ],

  rules: [
    { stage: 'intake', match: { step: 'start' }, kind: 'start' },
    { stage: 'intake', match: { step: 'intake' } },
    { stage: 'intake', match: { step: 'incremental_start' } },
    { stage: 'intake', match: { step: 'intake_complete' }, kind: 'complete' },

    {
      stage: 'classification',
      match: { step: 'classify_all' },
      kind: 'start',
    },
    {
      stage: 'classification',
      match: { step: 'classify_all_complete' },
      kind: 'complete',
    },

    { stage: 'analysis', match: { step: 'dispatch_loop' }, kind: 'start' },
    { stage: 'analysis', match: { step: 'analyze_document' } },
    {
      stage: 'analysis',
      match: { step: 'hitl_gate_1' },
      kind: 'complete',
    },

    { stage: 'hitl_gate_1', match: { step: 'hitl_gate_1' }, kind: 'start' },
    {
      stage: 'hitl_gate_1',
      match: { step: 'synthesis' },
      kind: 'complete',
    },

    { stage: 'synthesis', match: { step: 'synthesis' }, kind: 'start' },
    {
      stage: 'synthesis',
      match: { step: 'hitl_gate_2' },
      kind: 'complete',
    },

    { stage: 'hitl_gate_2', match: { step: 'hitl_gate_2' }, kind: 'start' },
    {
      stage: 'hitl_gate_2',
      match: { step: 'report_generation' },
      kind: 'complete',
    },

    {
      stage: 'report',
      match: { step: 'report_generation' },
      kind: 'start',
    },
    { stage: 'report', match: { step: 'complete' }, kind: 'complete' },
  ],
};
