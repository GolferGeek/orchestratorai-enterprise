import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { HumanGate } from '../../shared/reviews';
import { routeAfterDecision } from '../../shared/reviews';
import { reportProgress, scopeOf } from '../../shared/runs';
import type { WorkUnitService } from '../../shared/work-units';
import type { ActionItem, PostmortemState } from '../postmortem.state';

/** The incident lead approves the action items, or drops and rewrites them one by one. */
export const ACTIONS_GATE: Extract<HumanGate, { kind: 'approval' }> = {
  slug: 'approve-action-items',
  kind: 'approval',
  allowedDecisions: ['approve', 'modify'],
  allowItemDecisions: true,
  onReject: 'fail',
  taskTitle: 'Postmortem action items to approve',
};

/** Accept keeps an item, reject drops it, modify replaces its title with the rewrite. */
export function applyItemDecisions(items: ActionItem[], decisions: Array<{ itemId: string; decision: 'accept' | 'reject' | 'modify'; replacement?: unknown }>): ActionItem[] {
  const byKey = new Map(decisions.map((d) => [d.itemId, d]));
  for (const key of byKey.keys()) if (!items.some((i) => i.key === key)) throw new Error(`No action item ${key} to decide on`);
  return items.flatMap((item) => {
    const d = byKey.get(item.key);
    if (!d || d.decision === 'accept') return [item];
    if (d.decision === 'reject') return [];
    if (typeof d.replacement !== 'string' || !d.replacement.trim()) throw new Error(`The rewrite of ${item.key} must be non-empty text`);
    return [{ ...item, title: d.replacement.trim() }];
  });
}

export function createReviewNode(deps: { units: WorkUnitService }) {
  return async (state: PostmortemState, config: LangGraphRunnableConfig): Promise<Partial<PostmortemState>> => {
    const round = state.reviewRound;
    const response = await deps.units.runHuman(scopeOf(state), {
      slug: 'approve-action-items',
      gate: ACTIONS_GATE,
      round,
      payload: {
        title: state.title,
        severity: state.severity!.level,
        summary: state.postmortem!.summary,
        items: state.actionItems.map((i) => ({ itemId: i.key, title: i.title, owner: i.owner, priority: i.priority, due: i.due, why: i.why })),
      },
    });
    const route = routeAfterDecision(ACTIONS_GATE, response);
    let actionItems: ActionItem[];
    if (route === 'approved') actionItems = state.actionItems;
    else if (route === 'modified' && response.kind === 'decision' && response.decision.type === 'modify') actionItems = applyItemDecisions(state.actionItems, response.decision.items);
    else throw new Error(`The action item review ended with "${route}", which this gate does not allow.`);
    await reportProgress(config, 'review', 80, `${actionItems.length} action item(s) approved`);
    return { actionItems, reviewRound: round + 1 };
  };
}
