import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { HumanGate } from '../../shared/reviews';
import { routeAfterDecision } from '../../shared/reviews';
import { reportProgress, scopeOf } from '../../shared/runs';
import type { WorkUnitService } from '../../shared/work-units';
import { latest, type SwarmState } from '../swarm.state';

/**
 * A person picks the winner from the standings. Approve: the leader wins.
 * Item by item: drop a finalist to skip it and rewrite one to polish it; the
 * best-placed finalist left wins. Reject (with a reason): none of them.
 */
export const PICK_GATE: Extract<HumanGate, { kind: 'approval' }> = {
  slug: 'pick-winner',
  kind: 'approval',
  allowedDecisions: ['approve', 'modify', 'reject'],
  allowItemDecisions: true,
  onReject: 'record',
  taskTitle: 'Marketing swarm: pick the winner',
};

type ItemDecision = { itemId: string; decision: 'accept' | 'reject' | 'modify'; replacement?: unknown };

/** The winner from item decisions, in standings order. */
export function winnerFrom(
  finalists: Array<{ writer: string; text: string }>,
  decisions: ItemDecision[],
): { writer: string; text: string; edited: boolean } | null {
  const byItem = new Map(decisions.map((d) => [d.itemId, d]));
  for (const key of byItem.keys()) if (!finalists.some((f) => f.writer === key)) throw new Error(`No finalist ${key} to decide on`);
  for (const f of finalists) {
    const d = byItem.get(f.writer);
    if (d?.decision === 'reject') continue;
    if (d?.decision === 'modify') {
      if (typeof d.replacement !== 'string' || !d.replacement.trim()) throw new Error(`The rewrite of ${f.writer} must be non-empty text`);
      return { writer: f.writer, text: d.replacement.trim(), edited: true };
    }
    return { writer: f.writer, text: f.text, edited: false };
  }
  return null;
}

export function createPickNode(deps: { units: WorkUnitService }) {
  return async (state: SwarmState, config: LangGraphRunnableConfig): Promise<Partial<SwarmState>> => {
    const cfg = state.config!;
    const round = state.pickRound;
    const finalists = state.standings!.map((s) => {
      const d = state.drafts.find((x) => x.writer === s.writer)!;
      return { writer: s.writer, text: latest(d)!.text, standing: s };
    });
    const response = await deps.units.runHuman(scopeOf(state), {
      slug: 'pick-winner',
      gate: PICK_GATE,
      round,
      payload: {
        evaluators: cfg.evaluators.map((e) => ({ slug: e.slug, name: e.name })),
        items: finalists.map((f) => {
          const writer = cfg.writers.find((w) => w.slug === f.writer)!;
          return {
            itemId: f.writer,
            place: f.standing.place,
            writer: writer.name,
            model: `${writer.provider}/${writer.model}`,
            averagePlace: f.standing.averagePlace,
            byEvaluator: f.standing.byEvaluator,
            text: f.text,
          };
        }),
      },
    });
    const route = routeAfterDecision(PICK_GATE, response);
    if (response.kind !== 'decision') throw new Error('The pick gate expected a decision. This is a bug.');
    let winner: SwarmState['winner'] = null;
    let declined: string | null = null;
    if (route === 'approved') winner = { writer: finalists[0]!.writer, text: finalists[0]!.text, edited: false };
    else if (route === 'modified' && response.decision.type === 'modify') {
      winner = winnerFrom(finalists, response.decision.items);
      if (!winner) declined = response.decision.feedback?.trim() || 'Every finalist was dropped.';
    } else if (route === 'record' && response.decision.type === 'reject') declined = response.decision.feedback;
    else throw new Error(`The pick ended with "${route}", which this gate does not allow.`);
    await reportProgress(config, 'pick', 95, winner ? `${cfg.writers.find((w) => w.slug === winner!.writer)!.name} wins` : 'No winner picked');
    return { winner, declined, pickRound: round + 1 };
  };
}
