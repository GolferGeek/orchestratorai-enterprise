import type { WorkflowPresentation } from '@orchestrator-ai/transport-types';

export const COMPLIANCE_AUDIT_PRESENTATION: WorkflowPresentation = {
  agentSlug: 'legal-department',
  version: '2026-04-13.1',

  stages: [
    {
      id: 'ca_intake',
      label: 'Initializing audit',
      description: 'Validating audit context and preparing document pipeline.',
    },
    {
      id: 'ca_ingest',
      label: 'Ingesting policies',
      description:
        'Extracting text, segmenting into sections, classifying compliance domains.',
    },
    {
      id: 'ca_evaluate',
      label: 'Evaluating compliance',
      description:
        'Cross-referencing policy sections against regulatory framework requirements.',
    },
    {
      id: 'ca_hitl_review',
      label: 'Awaiting compliance review',
      description:
        'Paused for human review. A compliance officer must approve, reject, or modify findings.',
    },
    {
      id: 'ca_report',
      label: 'Generating report',
      description:
        'Synthesizing findings into executive summary, scorecard, and remediation plan.',
    },
  ],

  suppress: [
    { hookEventType: 'agent.llm.started' },
    { hookEventType: 'agent.llm.completed' },
    { hookEventType: 'agent.llm.failed' },
  ],

  activators: [],

  rules: [
    { stage: 'ca_intake', match: { step: 'ca_intake' }, kind: 'start' },
    {
      stage: 'ca_intake',
      match: { step: 'ca_intake_complete' },
      kind: 'complete',
    },
    {
      stage: 'ca_ingest',
      match: { step: 'ca_ingest_document' },
      kind: 'start',
    },
    {
      stage: 'ca_ingest',
      match: { step: 'ca_ingest_complete' },
      kind: 'complete',
    },
    {
      stage: 'ca_evaluate',
      match: { step: 'ca_cross_ref_loop' },
      kind: 'start',
    },
    { stage: 'ca_evaluate', match: { step: 'ca_evaluate_stub' } },
    { stage: 'ca_evaluate', match: { step: 'ca_evaluate_finding' } },
    {
      stage: 'ca_evaluate',
      match: { step: 'ca_evaluate_complete' },
      kind: 'complete',
    },
    { stage: 'ca_hitl_review', match: { step: 'ca_hitl_stub' }, kind: 'start' },
    {
      stage: 'ca_hitl_review',
      match: { step: 'ca_hitl_start' },
      kind: 'start',
    },
    {
      stage: 'ca_hitl_review',
      match: { step: 'ca_hitl_complete' },
      kind: 'complete',
    },
    { stage: 'ca_report', match: { step: 'ca_report_stub' }, kind: 'start' },
    {
      stage: 'ca_report',
      match: { step: 'ca_report_generation' },
      kind: 'start',
    },
    {
      stage: 'ca_report',
      match: { step: 'ca_report_complete' },
      kind: 'complete',
    },
  ],
};
