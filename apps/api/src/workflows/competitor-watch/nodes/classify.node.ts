import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { choiceOf } from '../../../decisions';
import { reportProgress, scopeOf } from '../../shared/runs';
import type { WorkUnitService } from '../../shared/work-units';
import type { CompetitorWatchState } from '../competitor-watch.state';
import { describeHunk } from '../diff';

/** Jev (competitor-change) classifies each change and says whether it is material. */
export function createClassifyNode(deps: { units: WorkUnitService }) {
  return async (state: CompetitorWatchState, config: LangGraphRunnableConfig): Promise<Partial<CompetitorWatchState>> => {
    await reportProgress(config, 'classify', 50, `Classifying ${state.changes.length} change(s)`);
    const verdicts = await deps.units.runCheck(scopeOf(state), {
      slug: 'classify-changes',
      checks: state.changes.map((c, i) => ({
        rubric: 'competitor-change',
        label: `${c.competitor} ${c.page} #${i + 1}`,
        inputs: { change: describeHunk(c), competitor: `${c.competitor} - ${c.page} page` },
      })),
    });
    return {
      changes: state.changes.map((c, i) => {
        const v = verdicts[i]!;
        return { ...c, type: choiceOf(v, 'type'), decision: v.decision, reason: v.reason };
      }),
    };
  };
}
