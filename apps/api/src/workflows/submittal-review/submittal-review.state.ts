import { Annotation } from '@langchain/langgraph';
import type { WorkflowDocumentRef } from '@orchestrator-ai/transport-types';
import { runtimeStateChannels } from '../shared/runs';
import type { Finding, SubmittalAction } from './findings';

export const SubmittalReviewStateAnnotation = Annotation.Root({
  ...runtimeStateChannels,
  specSection: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  submittalText: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  documents: Annotation<WorkflowDocumentRef[]>({ reducer: (_, n) => n, default: () => [] }),
  specText: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  findings: Annotation<Finding[]>({ reducer: (_, n) => n, default: () => [] }),
  reviewRound: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  action: Annotation<SubmittalAction | null>({ reducer: (_, n) => n, default: () => null }),
  letter: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
});

export type SubmittalReviewState = typeof SubmittalReviewStateAnnotation.State;
