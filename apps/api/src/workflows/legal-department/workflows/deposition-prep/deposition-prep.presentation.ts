import type { WorkflowPresentation } from '@orchestrator-ai/transport-types';

export const DEPOSITION_PREP_PRESENTATION: WorkflowPresentation = {
  agentSlug: 'legal-department',
  version: '2026-04-23.1',

  stages: [
    {
      id: 'case_analysis',
      label: 'Analyzing witness and case',
      description:
        'Reviewing the witness profile, case facts, and preparation objectives.',
    },
    {
      id: 'prep_plan',
      label: 'Building preparation plan',
      description:
        'Generating deposition themes, likely questions, and supporting preparation structure.',
    },
    {
      id: 'cross_exam',
      label: 'Modeling opposing examination',
      description:
        'Shifting into opposing-counsel perspective to generate likely cross-exam pressure points.',
      conditional: true,
    },
    {
      id: 'coaching',
      label: 'Coaching witness responses',
      description:
        'Refining answer strategy and practical witness guidance for deposition readiness.',
    },
    {
      id: 'complete',
      label: 'Preparation complete',
      description:
        'Final deposition preparation output is ready in the workspace.',
    },
  ],

  suppress: [
    { hookEventType: 'agent.llm.started' },
    { hookEventType: 'agent.llm.completed' },
    { hookEventType: 'agent.llm.failed' },
  ],

  activators: [
    {
      match: { step: 'opposing_perspective' },
      activatesStageIds: ['cross_exam'],
    },
    {
      match: { step: 'cross_exam_generation' },
      activatesStageIds: ['cross_exam'],
    },
  ],

  rules: [
    { stage: 'case_analysis', match: { step: 'start' }, kind: 'start' },
    {
      stage: 'case_analysis',
      match: { step: 'case_analysis' },
    },
    {
      stage: 'case_analysis',
      match: { step: 'question_generation' },
      kind: 'complete',
    },

    {
      stage: 'prep_plan',
      match: { step: 'question_generation' },
      kind: 'start',
    },
    { stage: 'prep_plan', match: { step: 'deposition_research' } },
    { stage: 'prep_plan', match: { step: 'deposition_synthesis' } },
    {
      stage: 'prep_plan',
      match: { step: 'opposing_perspective' },
      kind: 'complete',
    },

    {
      stage: 'cross_exam',
      match: { step: 'opposing_perspective' },
      kind: 'start',
    },
    { stage: 'cross_exam', match: { step: 'cross_exam_generation' } },
    {
      stage: 'cross_exam',
      match: { step: 'answer_coaching' },
      kind: 'complete',
    },

    { stage: 'coaching', match: { step: 'answer_coaching' }, kind: 'start' },
    { stage: 'coaching', match: { step: 'complete' }, kind: 'complete' },

    { stage: 'complete', match: { step: 'complete' }, kind: 'start' },
  ],
};
