import type { WorkflowPresentation } from '@orchestrator-ai/transport-types';

export const CONTRACT_REVIEW_PRESENTATION: WorkflowPresentation = {
  agentSlug: 'legal-department',
  version: '2026-04-24.1',

  stages: [
    {
      id: 'metadata',
      label: 'Reading contract',
      description:
        'Extracting contract metadata and preparing the document for clause-level review.',
    },
    {
      id: 'clause_segmentation',
      label: 'Segmenting clauses',
      description:
        'Breaking the contract into stable clauses for per-clause risk analysis.',
    },
    {
      id: 'routing',
      label: 'Routing specialist review',
      description:
        'Selecting the legal specialists needed for the contract and orchestrating clause review.',
    },
    {
      id: 'specialists',
      label: 'Reviewing clauses',
      description:
        'Running specialist analysis and proposed language across flagged provisions.',
    },
    {
      id: 'synthesis',
      label: 'Merging redline findings',
      description:
        'Combining specialist annotations into clause-level recommendations.',
    },
    {
      id: 'hitl_review',
      label: 'Awaiting clause review',
      description:
        'Paused for attorney accept, reject, or modify decisions on flagged clauses.',
    },
    {
      id: 'report',
      label: 'Generating redline package',
      description:
        'Producing the final risk assessment and redline-ready output.',
    },
  ],

  suppress: [
    { hookEventType: 'agent.llm.started' },
    { hookEventType: 'agent.llm.completed' },
    { hookEventType: 'agent.llm.failed' },
  ],

  rules: [
    {
      stage: 'metadata',
      match: { step: 'metadata_extraction' },
      kind: 'start',
    },
    {
      stage: 'metadata',
      match: { step: 'metadata_complete' },
      kind: 'complete',
    },

    {
      stage: 'clause_segmentation',
      match: { step: 'clause_segmentation' },
      kind: 'start',
    },
    {
      stage: 'clause_segmentation',
      match: { step: 'clause_segmentation_complete' },
      kind: 'complete',
    },

    { stage: 'routing', match: { step: 'clo_routing' }, kind: 'start' },
    { stage: 'routing', match: { step: 'clo_routing_complete' } },
    {
      stage: 'routing',
      match: { step: 'cr_orchestrator_start' },
      kind: 'complete',
    },

    {
      stage: 'specialists',
      match: { step: 'cr_orchestrator_start' },
      kind: 'start',
    },
    { stage: 'specialists', match: { step: 'contract-agent_contract_review' } },
    {
      stage: 'specialists',
      match: { step: 'compliance-agent_contract_review' },
    },
    {
      stage: 'specialists',
      match: { step: 'corporate-agent_contract_review' },
    },
    {
      stage: 'specialists',
      match: { step: 'employment-agent_contract_review' },
    },
    { stage: 'specialists', match: { step: 'ip-agent_contract_review' } },
    {
      stage: 'specialists',
      match: { step: 'litigation-agent_contract_review' },
    },
    { stage: 'specialists', match: { step: 'privacy-agent_contract_review' } },
    {
      stage: 'specialists',
      match: { step: 'real-estate-agent_contract_review' },
    },
    {
      stage: 'specialists',
      match: { step: 'cr_orchestrator_complete' },
      kind: 'complete',
    },

    { stage: 'synthesis', match: { step: 'cr_synthesis' }, kind: 'start' },
    {
      stage: 'synthesis',
      match: { step: 'cr_synthesis_complete' },
      kind: 'complete',
    },

    { stage: 'hitl_review', match: { step: 'cr_hitl_start' }, kind: 'start' },
    {
      stage: 'hitl_review',
      match: { step: 'cr_hitl_complete' },
      kind: 'complete',
    },

    { stage: 'report', match: { step: 'cr_report' }, kind: 'start' },
    {
      stage: 'report',
      match: { step: 'cr_report_complete' },
      kind: 'complete',
    },
  ],
};
