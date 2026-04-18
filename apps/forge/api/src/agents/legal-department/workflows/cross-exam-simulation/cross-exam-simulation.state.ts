import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type {
  CrossExamSimulationInput,
  SimulationAnswer,
  SimulationDebrief,
  SimulationQuestion,
  SimulationStrategy,
  TurnScore,
} from './cross-exam-simulation.types';

export const CrossExamSimulationStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,

  executionContext: Annotation<ExecutionContext>({
    reducer: (_, next) => next,
    default: () => ({
      orgSlug: '',
      userId: '',
      conversationId: '',
      agentSlug: '',
      agentType: '',
      provider: '',
      model: '',
    }),
  }),

  input: Annotation<CrossExamSimulationInput>({
    reducer: (_, next) => next,
    default: () => ({
      caseFacts: '',
      witnessBackground: '',
      maxQuestions: 30,
    }),
  }),

  simulationStrategy: Annotation<SimulationStrategy | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  currentTurn: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 1,
  }),

  currentTopic: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  sessionPhase: Annotation<'active' | 'debrief'>({
    reducer: (_, next) => next,
    default: () => 'active',
  }),

  questions: Annotation<SimulationQuestion[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  answers: Annotation<SimulationAnswer[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  scores: Annotation<TurnScore[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  topicsExhausted: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  documentsConfronted: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  debrief: Annotation<SimulationDebrief | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  status: Annotation<'processing' | 'awaiting_answer' | 'completed' | 'failed'>(
    {
      reducer: (_, next) => next,
      default: () => 'processing',
    },
  ),

  error: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  startedAt: Annotation<number>({
    reducer: (_, next) => next,
    default: () => Date.now(),
  }),

  completedAt: Annotation<number | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
});

export type CrossExamSimulationState =
  typeof CrossExamSimulationStateAnnotation.State;
