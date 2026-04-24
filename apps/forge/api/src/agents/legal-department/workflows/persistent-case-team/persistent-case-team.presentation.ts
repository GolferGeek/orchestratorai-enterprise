import type { WorkflowPresentation } from '@orchestrator-ai/transport-types';

export const PERSISTENT_CASE_TEAM_PRESENTATION: WorkflowPresentation = {
  agentSlug: 'legal-department',
  version: '2026-04-24.1',

  stages: [
    {
      id: 'start',
      label: 'Starting matter agents',
      description:
        'Launching the facts and documents agents for the uploaded matter material.',
    },
    {
      id: 'facts',
      label: 'Extracting facts',
      description:
        'Extracting entities, relationships, and timeline events into the matter knowledge base.',
    },
    {
      id: 'documents',
      label: 'Classifying documents',
      description:
        'Classifying document type, dates, parties, summaries, and key terms.',
    },
    {
      id: 'knowledge',
      label: 'Updating matter record',
      description:
        'Persisting extracted facts, document metadata, and indexed matter context.',
    },
    {
      id: 'complete',
      label: 'Matter record updated',
      description:
        'The matter dashboard is ready with refreshed entities, timeline, and document metadata.',
    },
  ],

  suppress: [
    { hookEventType: 'agent.llm.started' },
    { hookEventType: 'agent.llm.completed' },
    { hookEventType: 'agent.llm.failed' },
  ],

  rules: [
    { stage: 'start', match: { step: 'facts_start' }, kind: 'start' },
    { stage: 'start', match: { step: 'docs_start' } },
    {
      stage: 'start',
      match: { step: 'facts_extract_entities' },
      kind: 'complete',
    },
    { stage: 'start', match: { step: 'docs_classify' }, kind: 'complete' },

    {
      stage: 'facts',
      match: { step: 'facts_extract_entities' },
      kind: 'start',
    },
    { stage: 'facts', match: { step: 'facts_extract_timeline' } },
    {
      stage: 'facts',
      match: { step: 'facts_update_knowledge' },
      kind: 'complete',
    },

    { stage: 'documents', match: { step: 'docs_classify' }, kind: 'start' },
    { stage: 'documents', match: { step: 'docs_extract_metadata' } },
    {
      stage: 'documents',
      match: { step: 'docs_update_index' },
      kind: 'complete',
    },

    {
      stage: 'knowledge',
      match: { step: 'facts_update_knowledge' },
      kind: 'start',
    },
    { stage: 'knowledge', match: { step: 'docs_update_index' } },
    { stage: 'knowledge', match: { step: 'complete' }, kind: 'complete' },

    { stage: 'complete', match: { step: 'complete' }, kind: 'start' },
  ],
};
