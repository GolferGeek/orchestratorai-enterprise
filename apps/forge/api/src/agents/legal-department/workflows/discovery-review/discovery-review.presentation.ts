import type { WorkflowPresentation } from '@orchestrator-ai/transport-types';

export const DISCOVERY_REVIEW_PRESENTATION: WorkflowPresentation = {
  agentSlug: 'legal-department',
  version: '2026-04-23.1',

  stages: [
    {
      id: 'ingest',
      label: 'Ingesting discovery set',
      description:
        'Reading the uploaded corpus, normalizing files, and preparing documents for coding.',
    },
    {
      id: 'classify',
      label: 'Classifying documents',
      description:
        'Assigning document types and preparing the coding queue for review.',
    },
    {
      id: 'coding',
      label: 'Coding documents',
      description:
        'Running first-pass relevance, privilege, and hot-document analysis across the corpus.',
    },
    {
      id: 'batch_review',
      label: 'Awaiting batch review',
      description:
        'Pausing for staged privilege, relevance, hot-doc, and sample review checkpoints.',
    },
    {
      id: 'production',
      label: 'Generating production set',
      description:
        'Applying reviewed coding decisions and assembling the final production-ready output.',
    },
  ],

  suppress: [
    { hookEventType: 'agent.llm.started' },
    { hookEventType: 'agent.llm.completed' },
    { hookEventType: 'agent.llm.failed' },
  ],

  rules: [
    { stage: 'ingest', match: { step: 'start' }, kind: 'start' },
    { stage: 'ingest', match: { step: 'ingest' } },
    { stage: 'ingest', match: { step: 'ingest_complete' }, kind: 'complete' },

    { stage: 'classify', match: { step: 'classify_all' }, kind: 'start' },
    {
      stage: 'classify',
      match: { step: 'classify_all_complete' },
      kind: 'complete',
    },

    { stage: 'coding', match: { step: 'dispatch_loop' }, kind: 'start' },
    { stage: 'coding', match: { step: 'code_document' } },
    { stage: 'coding', match: { step: 'build_batches' }, kind: 'complete' },

    {
      stage: 'batch_review',
      match: { step: 'batch_hitl_privilege' },
      kind: 'start',
    },
    { stage: 'batch_review', match: { step: 'batch_hitl_relevance' } },
    { stage: 'batch_review', match: { step: 'batch_hitl_hot_docs' } },
    { stage: 'batch_review', match: { step: 'batch_hitl_sample' } },
    {
      stage: 'batch_review',
      match: { step: 'calibration_check' },
      kind: 'complete',
    },

    {
      stage: 'production',
      match: { step: 'generate_production_set' },
      kind: 'start',
    },
    { stage: 'production', match: { step: 'complete' }, kind: 'complete' },
  ],
};
