import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { reportProgress } from '../../shared/runs';
import type { HiresStoreService } from '../hires-store.service';
import type { OnboardingState } from '../onboarding.state';
import type { PolicyFactsService } from '../policy-facts.service';

/** The hire (linked to this run) and the policy facts the plan must follow. */
export function createLoadNode(deps: { hires: HiresStoreService; policy: PolicyFactsService }) {
  return async (state: OnboardingState, config: LangGraphRunnableConfig): Promise<Partial<OnboardingState>> => {
    const context = state.executionContext;
    await reportProgress(config, 'load', 10, 'Loading the new hire and HR policy');
    const input = state.input;
    if (!input) throw new Error('The onboarding run has no input. This is a bug.');
    let hire;
    if ('hire' in input) {
      hire = (await deps.hires.byRun(context.orgSlug, context.conversationId)) ?? (await deps.hires.add(context.orgSlug, input.hire, context.userId, context.conversationId));
    } else {
      hire = await deps.hires.get(context.orgSlug, input.hireId);
      if (!hire) throw new Error(`HR has no new hire ${input.hireId}`);
      await deps.hires.attachRun(context.orgSlug, hire.id, context.conversationId);
    }
    const policyFacts = await deps.policy.facts(context.orgSlug);
    return { hire, policyFacts };
  };
}
