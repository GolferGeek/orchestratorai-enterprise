import type { WorkflowPresentation } from '@orchestrator-ai/transport-types';

export const SENTINEL_PRESENTATION: WorkflowPresentation = {
  agentSlug: 'legal-department',
  version: '2026-04-24.1',

  stages: [
    {
      id: 'source',
      label: 'Loading monitoring source',
      description:
        'Fetching configured legal sources and preparing new items for review.',
    },
    {
      id: 'deduplicate',
      label: 'Deduplicating signals',
      description:
        'Removing previously seen source items before classification.',
    },
    {
      id: 'classify',
      label: 'Classifying legal signals',
      description:
        'Classifying rulings, enforcement activity, legislation, guidance, and legal news.',
    },
    {
      id: 'evaluate',
      label: 'Evaluating portfolio impact',
      description:
        'Cross-referencing legal signals against tracked clients, matters, and jurisdictions.',
    },
    {
      id: 'complete',
      label: 'Updating alert queue',
      description:
        'Storing new signals, updating source state, and generating portfolio alerts.',
    },
  ],

  suppress: [
    { hookEventType: 'agent.llm.started' },
    { hookEventType: 'agent.llm.completed' },
    { hookEventType: 'agent.llm.failed' },
  ],

  rules: [
    {
      stage: 'source',
      match: { step: 'sentinel_ingest_workflow_start' },
      kind: 'start',
    },
    {
      stage: 'source',
      match: { step: 'sentinel_evaluate_workflow_start' },
      kind: 'start',
    },
    { stage: 'source', match: { step: 'start' }, kind: 'start' },
    { stage: 'source', match: { step: 'fetch_source' } },
    { stage: 'source', match: { step: 'load_unprocessed' } },
    { stage: 'source', match: { step: 'deduplicate' }, kind: 'complete' },

    { stage: 'deduplicate', match: { step: 'deduplicate' }, kind: 'start' },
    { stage: 'deduplicate', match: { step: 'classify' }, kind: 'complete' },

    { stage: 'classify', match: { step: 'classify' }, kind: 'start' },
    { stage: 'classify', match: { step: 'store' }, kind: 'complete' },

    { stage: 'evaluate', match: { step: 'evaluate_loop' }, kind: 'start' },
    { stage: 'evaluate', match: { step: 'evaluate_signal' } },
    { stage: 'evaluate', match: { step: 'update_source' }, kind: 'complete' },
    { stage: 'evaluate', match: { step: 'complete' }, kind: 'complete' },

    { stage: 'complete', match: { step: 'store' }, kind: 'start' },
    { stage: 'complete', match: { step: 'update_source' } },
    { stage: 'complete', match: { step: 'complete' }, kind: 'complete' },
  ],
};
