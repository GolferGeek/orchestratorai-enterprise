import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type {
  CaseRecord,
  SimulationParameters,
  EvidencePhaseEntry,
  SimulationResult,
} from './monte-carlo-trial-simulator.types';

export const TrialSimulationStateAnnotation = Annotation.Root({
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
      simulationCount: 1,
      variationParameters: [],
    }),
  }),

  parameters: Annotation<SimulationParameters>({
    reducer: (_, next) => next,
    default: () => ({
      simulationId: '',
      simulationIndex: 0,
      juryComposition: {
        averageAge: 40,
        educationDistribution: {},
        occupationMix: [],
        attitudeBiases: {
          plaintiffSympathy: 0,
          corporateSkepticism: 0,
          expertDeference: 0,
        },
      },
      judgeCharacteristics: {
        strictnessOnEvidence: 0.5,
        sympathyBias: 0,
        patienceWithObjections: 0.5,
      },
      evidenceAdmissibility: {},
      witnessCredibilityModifiers: {},
    }),
  }),

  openingArguments: Annotation<
    { plaintiff: string; defense: string } | undefined
  >({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  evidencePhaseResults: Annotation<EvidencePhaseEntry[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  closingArguments: Annotation<
    { plaintiff: string; defense: string } | undefined
  >({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  deliberationOutput: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  simulationResult: Annotation<SimulationResult | undefined>({
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

export type TrialSimulationState = typeof TrialSimulationStateAnnotation.State;
