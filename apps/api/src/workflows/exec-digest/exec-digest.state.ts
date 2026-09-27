import { Annotation } from '@langchain/langgraph';
import { runtimeStateChannels } from '../shared/runs';
import type { OrgActivity } from './activity-store.service';
import type { DigestOrganization } from './exec-digest.input';

export interface OrgSummary {
  organization: string;
  headline: string;
  summary: string;
  watch: string[];
}

export const ExecDigestStateAnnotation = Annotation.Root({
  ...runtimeStateChannels,
  organizations: Annotation<DigestOrganization[]>({ reducer: (_, n) => n, default: () => [] }),
  /** Fixed at the first step, so a retry or restart reports the same week. */
  weekEnding: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  activity: Annotation<OrgActivity[]>({ reducer: (_, n) => n, default: () => [] }),
  summaries: Annotation<OrgSummary[]>({ reducer: (_, n) => n, default: () => [] }),
  companySummary: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
});

export type ExecDigestState = typeof ExecDigestStateAnnotation.State;
