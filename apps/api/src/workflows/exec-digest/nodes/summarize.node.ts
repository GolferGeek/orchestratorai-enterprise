import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { reportProgress, scopeOf } from '../../shared/runs';
import type { WorkUnitService } from '../../shared/work-units';
import { weekWindow } from '../exec-digest.input';
import type { ExecDigestState, OrgSummary } from '../exec-digest.state';

interface OrgWriterOutput {
  headline: string;
  summary: string;
  watch: string[];
}

/** One paragraph per department, all at once, from its numbers only. */
export function createSummarizeNode(deps: { units: WorkUnitService }) {
  return async (state: ExecDigestState, config: LangGraphRunnableConfig): Promise<Partial<ExecDigestState>> => {
    await reportProgress(config, 'summarize', 40, `Writing ${state.activity.length} department summaries`);
    const week = weekWindow(state.weekEnding!);
    const panel = await deps.units.runPanel<OrgWriterOutput>(scopeOf(state), {
      slug: 'summarize-departments',
      panelists: state.activity.map((activity) => ({
        agent: 'exec-digest-org-writer',
        label: activity.organization,
        input: { organization: activity.organization, week: { from: week.from.slice(0, 10), weekEnding: state.weekEnding! }, activity },
      })),
      maxConcurrent: 6,
      policy: { mode: 'fail_all' },
    });
    const summaries: OrgSummary[] = panel.results.map((result, index) => {
      if (!result.ok) throw new Error(`No summary for ${state.activity[index]!.organization}: ${result.error}`);
      return { organization: state.activity[index]!.organization, ...result.output };
    });
    return { summaries };
  };
}
