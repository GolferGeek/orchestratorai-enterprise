import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { HumanGate } from '../../shared/reviews';
import { routeAfterDecision } from '../../shared/reviews';
import { reportProgress, scopeOf } from '../../shared/runs';
import type { WorkUnitService } from '../../shared/work-units';
import type { OnboardingRequest, OnboardingState } from '../onboarding.state';

/** The manager approves the requests, or drops and rewrites them one by one. */
export const PLAN_GATE: Extract<HumanGate, { kind: 'approval' }> = {
  slug: 'approve-onboarding',
  kind: 'approval',
  allowedDecisions: ['approve', 'modify'],
  allowItemDecisions: true,
  onReject: 'fail',
  taskTitle: 'Onboarding plan to approve',
};

export function applyRequestDecisions(requests: OnboardingRequest[], decisions: Array<{ itemId: string; decision: 'accept' | 'reject' | 'modify'; replacement?: unknown }>): OnboardingRequest[] {
  const byKey = new Map(decisions.map((d) => [d.itemId, d]));
  for (const key of byKey.keys()) if (!requests.some((r) => r.key === key)) throw new Error(`No request ${key} to decide on`);
  return requests.flatMap((r) => {
    const d = byKey.get(r.key);
    if (!d || d.decision === 'accept') return [r];
    if (d.decision === 'reject') return [];
    if (typeof d.replacement !== 'string' || !d.replacement.trim()) throw new Error(`The rewrite of ${r.key} must be non-empty text`);
    return [{ ...r, item: d.replacement.trim() }];
  });
}

export function createReviewNode(deps: { units: WorkUnitService }) {
  return async (state: OnboardingState, config: LangGraphRunnableConfig): Promise<Partial<OnboardingState>> => {
    const round = state.reviewRound;
    const hire = state.hire!;
    const response = await deps.units.runHuman(scopeOf(state), {
      slug: 'approve-onboarding',
      gate: PLAN_GATE,
      round,
      payload: {
        hire: { name: hire.fullName, role: hire.roleTitle, team: hire.team, manager: hire.managerName, startDate: hire.startDate },
        welcome: state.plan!.welcome,
        items: state.requests.map((r) => ({ itemId: r.key, kind: r.kind, item: r.item, owner: r.owner, neededBy: r.neededBy })),
      },
    });
    const route = routeAfterDecision(PLAN_GATE, response);
    let requests: OnboardingRequest[];
    if (route === 'approved') requests = state.requests;
    else if (route === 'modified' && response.kind === 'decision' && response.decision.type === 'modify') requests = applyRequestDecisions(state.requests, response.decision.items);
    else throw new Error(`The onboarding review ended with "${route}", which this gate does not allow.`);
    await reportProgress(config, 'review', 80, `${requests.length} request(s) approved`);
    return { requests, reviewRound: round + 1 };
  };
}
