/**
 * Sentinel Ingest Workflow — State Annotation.
 *
 * Tracks the ingestion pipeline: fetch → deduplicate → classify → store → update source.
 */
import { Annotation } from '@langchain/langgraph';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type {
  SourceConfig,
  RawItem,
  ClassifiedSignal,
  SentinelIngestStatus,
} from './sentinel-ingest.types';

export const SentinelIngestStateAnnotation = Annotation.Root({
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

  sourceConfig: Annotation<SourceConfig | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  rawItems: Annotation<RawItem[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  newSignals: Annotation<RawItem[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  classifiedSignals: Annotation<ClassifiedSignal[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  status: Annotation<SentinelIngestStatus>({
    reducer: (_, next) => next,
    default: () => 'fetching',
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

export type SentinelIngestState = typeof SentinelIngestStateAnnotation.State;
