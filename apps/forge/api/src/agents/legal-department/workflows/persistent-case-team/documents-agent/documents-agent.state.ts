import { Annotation } from '@langchain/langgraph';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';

export const DocumentsAgentStateAnnotation = Annotation.Root({
  executionContext: Annotation<ExecutionContext>(),
  matterId: Annotation<string>(),
  documentId: Annotation<string>(),
  storagePath: Annotation<string>(),
  documentContent: Annotation<string>({
    default: () => '',
    reducer: (_, b) => b,
  }),
  documentClass: Annotation<string | null>({
    default: () => null,
    reducer: (_, b) => b,
  }),
  documentDate: Annotation<string | null>({
    default: () => null,
    reducer: (_, b) => b,
  }),
  summary: Annotation<string | null>({
    default: () => null,
    reducer: (_, b) => b,
  }),
  parties: Annotation<string[]>({
    default: () => [],
    reducer: (_, b) => b,
  }),
  keyTerms: Annotation<string[]>({
    default: () => [],
    reducer: (_, b) => b,
  }),
  additionalMetadata: Annotation<Record<string, unknown>>({
    default: () => ({}),
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

export type DocumentsAgentState = typeof DocumentsAgentStateAnnotation.State;
