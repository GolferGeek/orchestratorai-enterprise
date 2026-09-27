import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { reportProgress } from '../../shared/runs';
import type { RunTasksService } from '../../shared/tasks';
import type { OnboardingState } from '../onboarding.state';

/** Each approved request becomes a task for its owning team, once. */
export function createTasksNode(deps: { runTasks: RunTasksService; webUrl: string }) {
  return async (state: OnboardingState, config: LangGraphRunnableConfig): Promise<Partial<OnboardingState>> => {
    const context = state.executionContext;
    const hire = state.hire!;
    await reportProgress(config, 'tasks', 90, `Creating ${state.requests.length} request(s)`);
    const link = `${deps.webUrl}/app/workflows/onboarding-plan?conversationId=${encodeURIComponent(context.conversationId)}`;
    const created = await deps.runTasks.create({ schema: 'hr', table: 'onboarding_tasks' }, context.orgSlug, context.conversationId, state.requests.map((r) => ({
      key: r.key,
      title: `[Onboarding] ${r.item} for ${hire.fullName}`,
      description: `${hire.fullName} (${hire.roleTitle}, ${hire.team}) starts ${hire.startDate}. Needed ${r.neededBy}. Owner: ${r.owner}.\n\nPlan: ${link}`,
    })));
    return { requests: state.requests.map((r) => ({ ...r, task: created.get(r.key)! })) };
  };
}
