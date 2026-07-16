/**
 * Sentinel Evaluate Workflow — State Annotation.
 *
 * Tracks the evaluation pipeline: load unprocessed → evaluate loop → complete.
 */
import { Annotation } from '@langchain/langgraph';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type {
  SentinelSignal,
  CreateAlertDto,
} from '../../sentinel/sentinel.types';
import type {
  PortfolioMatch,
  SentinelEvaluateStatus,
} from './sentinel-evaluate.types';

export const SentinelEvaluateStateAnnotation = Annotation.Root({
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

  unprocessedSignals: Annotation<SentinelSignal[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  currentSignal: Annotation<SentinelSignal | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  portfolioMatches: Annotation<PortfolioMatch[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  alerts: Annotation<CreateAlertDto[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  status: Annotation<SentinelEvaluateStatus>({
    reducer: (_, next) => next,
    default: () => 'loading',
  }),

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

export type SentinelEvaluateState =
  typeof SentinelEvaluateStateAnnotation.State;
