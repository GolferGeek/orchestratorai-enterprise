import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { reportProgress } from '../../shared/runs';
import type { ActivityStoreService } from '../activity-store.service';
import { weekWindow } from '../exec-digest.input';
import type { ExecDigestState } from '../exec-digest.state';

/** Count each department's week. The week is fixed here, once, for retries and restarts. */
export function createGatherNode(deps: { store: ActivityStoreService; today: () => string }) {
  return async (state: ExecDigestState, config: LangGraphRunnableConfig): Promise<Partial<ExecDigestState>> => {
    const weekEnding = state.weekEnding ?? deps.today();
    await reportProgress(config, 'gather', 10, `Counting activity for the week ending ${weekEnding}`);
    const window = weekWindow(weekEnding);
    const activity = [];
    for (const organization of state.organizations) activity.push(await deps.store.week(organization, window));
    return { weekEnding, activity };
  };
}
