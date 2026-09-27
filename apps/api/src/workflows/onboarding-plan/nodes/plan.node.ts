import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { reportProgress, scopeOf } from '../../shared/runs';
import type { WorkUnitService } from '../../shared/work-units';
import type { OnboardingPlan, OnboardingRequest, OnboardingState } from '../onboarding.state';

type Drafted = OnboardingPlan & { requests: Array<Omit<OnboardingRequest, 'key' | 'task'>> };

/** The planner drafts the first week, 30/60/90 and the requests, from the hire and policy. */
export function createPlanNode(deps: { units: WorkUnitService }) {
  return async (state: OnboardingState, config: LangGraphRunnableConfig): Promise<Partial<OnboardingState>> => {
    const hire = state.hire!;
    await reportProgress(config, 'plan', 40, `Drafting ${hire.fullName}'s onboarding plan`);
    const { requests, ...plan } = await deps.units.runSolo<Drafted>(scopeOf(state), {
      slug: 'draft-plan',
      agent: 'onboarding-planner',
      input: {
        hire: { name: hire.fullName, role: hire.roleTitle, team: hire.team, manager: hire.managerName, location: hire.location, employmentType: hire.employmentType, startDate: hire.startDate, notes: hire.notes },
        policyFacts: state.policyFacts,
      },
    });
    return { plan, requests: requests.map((r, i) => ({ ...r, key: `request-${i + 1}`, task: null })) };
  };
}
