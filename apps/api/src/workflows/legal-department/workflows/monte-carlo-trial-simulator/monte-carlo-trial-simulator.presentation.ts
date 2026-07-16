import type { WorkflowPresentation } from '@orchestrator-ai/transport-types';

export const MONTE_CARLO_TRIAL_SIMULATOR_PRESENTATION: WorkflowPresentation = {
  agentSlug: 'legal-department',
  version: '2026-04-18.1',

  stages: [
    {
      id: 'parameter_generation',
      label: 'Generating simulation parameters',
      description:
        'Creating stratified parameter sets across jury compositions, judge profiles, and evidence admissibility variations.',
    },
    {
      id: 'simulation_running',
      label: 'Running simulations',
      description:
        'Executing simulated mini-trials with adversarial plaintiff and defense agents, judge, and jury deliberation.',
    },
    {
      id: 'aggregating',
      label: 'Aggregating results',
      description:
        'Computing outcome distribution, damages statistics, expected value, and sensitivity analysis.',
    },
    {
      id: 'complete',
      label: 'Simulation complete',
      description:
        'Monte Carlo trial simulation finished. Results ready for review.',
    },
  ],

  suppress: [
    { hookEventType: 'agent.llm.started' },
    { hookEventType: 'agent.llm.completed' },
    { hookEventType: 'agent.llm.failed' },
  ],

  rules: [
    {
      stage: 'parameter_generation',
      match: { step: 'parameter_generation' },
      kind: 'start',
    },
    {
      stage: 'parameter_generation',
      match: { step: 'parameter_generation_complete' },
      kind: 'complete',
    },
    {
      stage: 'simulation_running',
      match: { step: 'simulation_running' },
      kind: 'start',
    },
    {
      stage: 'simulation_running',
      match: { step: 'simulation_running_complete' },
      kind: 'complete',
    },
    {
      stage: 'aggregating',
      match: { step: 'aggregating' },
      kind: 'start',
    },
    {
      stage: 'aggregating',
      match: { step: 'aggregating_complete' },
      kind: 'complete',
    },
    {
      stage: 'complete',
      match: { step: 'complete' },
      kind: 'start',
    },
  ],
};
