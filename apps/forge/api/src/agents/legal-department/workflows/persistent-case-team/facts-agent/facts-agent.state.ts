import { Annotation } from '@langchain/langgraph';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type {
  ExtractedEntity,
  ExtractedTimelineEntry,
} from './facts-agent.types';

export const FactsAgentStateAnnotation = Annotation.Root({
  executionContext: Annotation<ExecutionContext>(),
  matterId: Annotation<string>(),
  documentId: Annotation<string>(),
  storagePath: Annotation<string>(),
  documentContent: Annotation<string>({
    default: () => '',
    reducer: (_, b) => b,
  }),
  entities: Annotation<ExtractedEntity[]>({
    default: () => [],
    reducer: (_, b) => b,
  }),
  timelineEntries: Annotation<ExtractedTimelineEntry[]>({
    default: () => [],
    reducer: (_, b) => b,
  }),
  priorKnowledgeSummary: Annotation<string>({
    default: () => '',
    reducer: (_, b) => b,
  }),
  status: Annotation<'processing' | 'completed' | 'failed'>({
    default: () => 'processing',
    reducer: (_, b) => b,
  }),
  error: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_, b) => b,
  }),
  startedAt: Annotation<number>({
    default: () => Date.now(),
    reducer: (_, b) => b,
  }),
});

export type FactsAgentState = typeof FactsAgentStateAnnotation.State;
