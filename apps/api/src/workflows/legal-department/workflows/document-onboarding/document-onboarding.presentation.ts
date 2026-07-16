import type { WorkflowPresentation } from '@orchestrator-ai/transport-types';

export const DOCUMENT_ONBOARDING_PRESENTATION: WorkflowPresentation = {
  agentSlug: 'legal-department',
  version: '2026-04-24.1',

  stages: [
    {
      id: 'metadata',
      label: 'Reading your document',
      description:
        'Extracting metadata: document type, parties, dates, and signatures.',
    },
    {
      id: 'classify',
      label: 'Routing to specialists',
      description:
        'Classifying the document and selecting the right legal specialists.',
    },
    {
      id: 'specialists',
      label: 'Running specialist review',
      description:
        'Reviewing contract, compliance, IP, privacy, employment, corporate, litigation, and real-estate issues as needed.',
    },
    {
      id: 'synthesis',
      label: 'Synthesizing findings',
      description:
        'Combining specialist outputs into one coherent legal assessment.',
    },
    {
      id: 'hitl_review',
      label: 'Awaiting attorney review',
      description:
        'Paused for human review before the final report is generated.',
    },
    {
      id: 'report',
      label: 'Writing final report',
      description:
        'Generating the risk assessment, executive summary, and recommendations.',
    },
  ],

  suppress: [
    { hookEventType: 'agent.llm.started' },
    { hookEventType: 'agent.llm.completed' },
    { hookEventType: 'agent.llm.failed' },
    { stepPrefix: 'orchestrator_' },
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
    { stage: 'metadata', match: { step: 'echo' }, kind: 'start' },
    { stage: 'metadata', match: { step: 'echo_complete' }, kind: 'complete' },
    { stage: 'metadata', match: { step: 'echo_skip' }, kind: 'complete' },

    { stage: 'classify', match: { step: 'clo_routing' }, kind: 'start' },
    {
      stage: 'classify',
      match: { step: 'clo_routing_complete' },
      kind: 'complete',
    },

    {
      stage: 'specialists',
      match: { stepPrefix: 'contract_agent' },
      kind: 'start',
    },
    { stage: 'specialists', match: { stepPrefix: 'compliance_agent' } },
    { stage: 'specialists', match: { stepPrefix: 'corporate_agent' } },
    { stage: 'specialists', match: { stepPrefix: 'employment_agent' } },
    { stage: 'specialists', match: { stepPrefix: 'ip_agent' } },
    { stage: 'specialists', match: { stepPrefix: 'litigation_agent' } },
    { stage: 'specialists', match: { stepPrefix: 'privacy_agent' } },
    { stage: 'specialists', match: { stepPrefix: 'real_estate_agent' } },
    {
      stage: 'specialists',
      match: { stepPrefix: 'synthesis' },
      kind: 'complete',
    },

    { stage: 'synthesis', match: { stepPrefix: 'synthesis' }, kind: 'start' },
    {
      stage: 'synthesis',
      match: { step: 'synthesis_complete' },
      kind: 'complete',
    },

    {
      stage: 'hitl_review',
      match: { step: 'hitl_checkpoint_start' },
      kind: 'start',
    },
    {
      stage: 'hitl_review',
      match: { step: 'hitl_checkpoint_complete' },
      kind: 'complete',
    },

    {
      stage: 'report',
      match: { stepPrefix: 'report_generation' },
      kind: 'start',
    },
    { stage: 'report', match: { step: 'report_complete' }, kind: 'complete' },
  ],
};
