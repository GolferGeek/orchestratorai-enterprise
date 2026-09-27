import { Annotation } from '@langchain/langgraph';
import { runtimeStateChannels } from '../shared/runs';

export type Severity = 'SEV1' | 'SEV2' | 'SEV3';

export interface Postmortem {
  summary: string;
  impact: string;
  timeline: Array<{ time: string; event: string }>;
  rootCause: string;
  contributingFactors: string[];
  whatWentWell: string[];
  lessons: string[];
}

export interface ActionItem {
  key: string;
  title: string;
  owner: string;
  priority: 'high' | 'medium' | 'low';
  due: string;
  why: string;
  /** Set once the task exists in the team's work tracker. */
  task: { provider: string; id: string } | null;
}

export const PostmortemStateAnnotation = Annotation.Root({
  ...runtimeStateChannels,
  title: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  incident: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  severity: Annotation<{ level: Severity; dataAffected: number | null } | null>({ reducer: (_, n) => n, default: () => null }),
  postmortem: Annotation<Postmortem | null>({ reducer: (_, n) => n, default: () => null }),
  actionItems: Annotation<ActionItem[]>({ reducer: (_, n) => n, default: () => [] }),
  reviewRound: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
});

export type PostmortemState = typeof PostmortemStateAnnotation.State;
