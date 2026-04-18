import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type {
  CaseRecord,
  SimulationParameters,
  SimulationResult,
  MonteCarloTrialSimulatorResult,
} from './monte-carlo-trial-simulator.types';

export const TrialSimulatorStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,

  executionContext: Annotation<ExecutionContext>({
    reducer: (_, next) => next,
    default: () => ({
      orgSlug: '',
      userId: '',
      conversationId: '',
      agentSlug: 'legal-department',
      agentType: 'langgraph',
      provider: 'ollama',
      model: 'gemma4:e4b',
    }),
  }),

  caseRecord: Annotation<CaseRecord>({
    reducer: (_, next) => next,
    default: () => ({
      matterId: '',
      jurisdiction: '',
      courtLevel: 'federal-district',
      caseType: '',
      claims: [],
      defenses: [],
      evidence: [],
      witnesses: [],
      damagesModel: [],
      simulationCount: 50,
      variationParameters: [],
    }),
  }),

  parameterSets: Annotation<SimulationParameters[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  simulationResults: Annotation<SimulationResult[]>({
    reducer: (existing, next) => [...existing, ...next],
    default: () => [],
  }),

  currentSimulationIndex: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  aggregation: Annotation<MonteCarloTrialSimulatorResult | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  status: Annotation<'processing' | 'completed' | 'failed'>({
    reducer: (_, next) => next,
    default: () => 'processing',
  }),

  error: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  startedAt: Annotation<number>({
    reducer: (_, next) => next,
    default: () => Date.now(),
  }),

  tokenUsage: Annotation<{ input: number; output: number }>({
    reducer: (_, next) => next,
    default: () => ({ input: 0, output: 0 }),
  }),
});

export type TrialSimulatorState = typeof TrialSimulatorStateAnnotation.State;
