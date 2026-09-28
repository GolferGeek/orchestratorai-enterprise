import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { reportProgress } from '../../shared/runs';
import { composite } from '../scoring';
import { latest, type Draft, type SwarmState } from '../swarm.state';
import { board } from './board';

/**
 * Each editor's verdict on each newly scored draft, in code: its weighted
 * facet score against its threshold. A draft every editor passes is
 * approved; one that is short goes back for a rewrite while rounds remain,
 * and is final otherwise.
 */
export function gateDrafts(state: SwarmState): Draft[] {
  const cfg = state.config!;
  const roundsLeft = state.cycle < state.input!.maxEditCycles;
  return state.drafts.map((d) => {
    if (d.status !== 'scoring') return d;
    const v = latest(d)!;
    const editors = Object.fromEntries(
      cfg.editors.map((e) => {
        const score = composite(e.weights, v.scores);
        return [e.slug, { score, pass: score >= e.threshold }];
      }),
    );
    const versions = [...d.versions];
    versions[versions.length - 1] = { ...v, editors };
    const approved = Object.values(editors).every((e) => e.pass);
    return { ...d, versions, status: approved ? 'approved' : roundsLeft ? 'revising' : 'final' };
  });
}

export function createGateNode() {
  return async (state: SwarmState, config: LangGraphRunnableConfig): Promise<Partial<SwarmState>> => {
    const drafts = gateDrafts(state);
    const approved = drafts.filter((d) => d.status === 'approved').length;
    const revising = drafts.filter((d) => d.status === 'revising').length;
    const next = { ...state, drafts };
    await reportProgress(config, 'gate', 40 + state.cycle * 10, `${approved} approved by every editor, ${revising} going back for a rewrite`, board(next));
    return { drafts };
  };
}

/** After the gate: coach the drafts that go back, or rank what we have. */
export const routeAfterGate = (state: SwarmState): 'coach' | 'standings' =>
  state.drafts.some((d) => d.status === 'revising') ? 'coach' : 'standings';
