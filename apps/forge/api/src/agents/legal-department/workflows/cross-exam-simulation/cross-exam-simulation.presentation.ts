import type { WorkflowPresentation } from '@orchestrator-ai/transport-types';

export const CROSS_EXAM_SIMULATION_PRESENTATION: WorkflowPresentation = {
  agentSlug: 'legal-department',
  version: '2026-04-24.1',

  stages: [
    {
      id: 'setup',
      label: 'Setting up simulation',
      description:
        'Preparing the cross-exam session from witness context, focus area, and question limits.',
    },
    {
      id: 'questioning',
      label: 'Generating question',
      description:
        'Producing the next cross-examination question and pausing for the witness answer.',
    },
    {
      id: 'scoring',
      label: 'Scoring answer',
      description:
        'Evaluating the witness answer for credibility, consistency, and exposure.',
    },
    {
      id: 'strategy',
      label: 'Choosing next move',
      description:
        'Deciding whether to press further, change topic, or move to the final debrief.',
    },
    {
      id: 'debrief',
      label: 'Writing debrief',
      description:
        'Summarizing weak moments, answer patterns, and coaching recommendations.',
    },
  ],

  suppress: [
    { hookEventType: 'agent.llm.started' },
    { hookEventType: 'agent.llm.completed' },
    { hookEventType: 'agent.llm.failed' },
  ],

  rules: [
    { stage: 'setup', match: { step: 'simulation_setup' }, kind: 'start' },
    {
      stage: 'setup',
      match: { step: 'simulation_setup_complete' },
      kind: 'complete',
    },

    {
      stage: 'questioning',
      match: { step: 'question_generator' },
      kind: 'start',
    },
    {
      stage: 'questioning',
      match: { step: 'answer_scorer' },
      kind: 'complete',
    },

    { stage: 'scoring', match: { step: 'answer_scorer' }, kind: 'start' },
    {
      stage: 'scoring',
      match: { step: 'next_move_decider' },
      kind: 'complete',
    },

    { stage: 'strategy', match: { step: 'next_move_decider' }, kind: 'start' },
    {
      stage: 'strategy',
      match: { step: 'question_generator' },
      kind: 'complete',
    },
    {
      stage: 'strategy',
      match: { step: 'debrief_generator' },
      kind: 'complete',
    },

    { stage: 'debrief', match: { step: 'debrief_generator' }, kind: 'start' },
  ],
};
