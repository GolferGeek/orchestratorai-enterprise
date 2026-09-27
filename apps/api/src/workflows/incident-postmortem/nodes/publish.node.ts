import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { reportProgress } from '../../shared/runs';
import type { PostmortemTasksService } from '../postmortem-tasks.service';
import type { PostmortemState } from '../postmortem.state';

/** Each approved action item becomes a task in the team's tracker, once. */
export function createPublishNode(deps: { tasks: PostmortemTasksService; webUrl: string }) {
  return async (state: PostmortemState, config: LangGraphRunnableConfig): Promise<Partial<PostmortemState>> => {
    await reportProgress(config, 'publish', 90, `Creating ${state.actionItems.length} task(s)`);
    const context = state.executionContext;
    const link = `${deps.webUrl}/app/workflows/incident-postmortem?conversationId=${encodeURIComponent(context.conversationId)}`;
    const actionItems = await deps.tasks.create(context.orgSlug, context.conversationId, state.title, state.actionItems, link);
    return { actionItems };
  };
}
