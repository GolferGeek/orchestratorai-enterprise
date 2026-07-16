/**
 * AdversarialBriefPresentation — user-facing stage manifest for the
 * adversarial brief stress-testing workflow.
 *
 * Stages are round-aware: blue_team, red_team, and judge stages update
 * their labels with the current round number via event payload.
 */
import type { WorkflowPresentation } from '@orchestrator-ai/transport-types';

export const ADVERSARIAL_BRIEF_PRESENTATION: WorkflowPresentation = {
  agentSlug: 'legal-department',
  version: '2026-04-10.1',

  stages: [
    {
      id: 'brief_analysis',
      label: 'Analyzing your brief',
      description:
        'Extracting arguments, citations, and factual assertions from the brief.',
    },
    {
      id: 'blue_team',
      label: 'Blue Team defending',
      description:
        'Argument, authority, and facts defenders building the case for the brief.',
    },
    {
      id: 'red_team',
      label: 'Red Team attacking',
      description:
        'Counter-argument, distinguishing-cases, and factual-challenge agents attacking the brief.',
    },
    {
      id: 'judge',
      label: 'Judge scoring',
      description:
        'Scoring each argument exchange on legal soundness, factual support, citation quality, and persuasiveness.',
    },
    {
      id: 'convergence',
      label: 'Checking convergence',
      description:
        'Determining whether the debate should continue or has converged.',
    },
    {
      id: 'synthesis',
      label: 'Writing stress-test report',
      description:
        'Ranking attacks, identifying weak citations, and producing the final assessment.',
    },
    {
      id: 'hitl_review',
      label: 'Awaiting attorney review',
      description:
        'Paused for human-in-the-loop review. Accept, modify, or reject recommendations.',
    },
    {
      id: 'fortification',
      label: 'Applying fortifications',
      conditional: true,
      description: 'Revising the brief with accepted recommendations.',
    },
    {
      id: 'report',
      label: 'Generating final report',
      description:
        'Formatting the stress-test report with debate transcript and recommendations.',
    },
  ],

  suppress: [
    { hookEventType: 'agent.llm.started' },
    { hookEventType: 'agent.llm.completed' },
    { hookEventType: 'agent.llm.failed' },
  ],

  activators: [
    {
      match: { step: 'fortification' },
      activatesStageIds: ['fortification'],
    },
  ],

  rules: [
    // Brief analysis
    {
      stage: 'brief_analysis',
      match: { step: 'brief_analysis' },
      kind: 'start',
    },
    {
      stage: 'brief_analysis',
      match: { step: 'brief_analysis_complete' },
      kind: 'complete',
    },

    // Blue Team (round-aware)
    { stage: 'blue_team', match: { step: 'blue_team' }, kind: 'start' },
    {
      stage: 'blue_team',
      match: { step: 'blue_team_complete' },
      kind: 'complete',
    },

    // Red Team (round-aware)
    { stage: 'red_team', match: { step: 'red_team' }, kind: 'start' },
    {
      stage: 'red_team',
      match: { step: 'red_team_complete' },
      kind: 'complete',
    },

    // Judge (round-aware)
    { stage: 'judge', match: { step: 'judge' }, kind: 'start' },
    { stage: 'judge', match: { step: 'judge_complete' }, kind: 'complete' },

    // Convergence
    { stage: 'convergence', match: { step: 'convergence' }, kind: 'start' },
    {
      stage: 'convergence',
      match: { step: 'convergence_complete' },
      kind: 'complete',
    },
    {
      stage: 'convergence',
      match: { step: 'convergence_continue' },
      kind: 'complete',
    },

    // Synthesis
    { stage: 'synthesis', match: { step: 'synthesis' }, kind: 'start' },
    {
      stage: 'synthesis',
      match: { step: 'synthesis_complete' },
      kind: 'complete',
    },

    // HITL review
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

    // Fortification (conditional)
    {
      stage: 'fortification',
      match: { step: 'fortification' },
      kind: 'start',
    },
    {
      stage: 'fortification',
      match: { step: 'fortification_complete' },
      kind: 'complete',
    },

    // Report generation
    {
      stage: 'report',
      match: { step: 'report_generation' },
      kind: 'start',
    },
    {
      stage: 'report',
      match: { step: 'report_complete' },
      kind: 'complete',
    },
  ],
};
