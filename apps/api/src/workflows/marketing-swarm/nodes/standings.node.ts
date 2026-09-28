import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { reportProgress } from '../../shared/runs';
import { standings } from '../scoring';
import { latest, type SwarmState } from '../swarm.state';
import { board } from './board';

/** Each evaluator ranks every draft's final version; overall is the mean place. Code, not a model. */
export function createStandingsNode() {
  return async (state: SwarmState, config: LangGraphRunnableConfig): Promise<Partial<SwarmState>> => {
    const cfg = state.config!;
    const ranked = state.drafts.filter((d) => d.status !== 'failed');
    const result = standings(
      ranked.map((d) => ({ writer: d.writer, scores: latest(d)!.scores })),
      cfg.evaluators.map((e) => ({ slug: e.slug, weights: e.weights })),
    );
    const drafts = state.drafts.map((d) => (d.status === 'approved' ? { ...d, status: 'final' as const } : d));
    const next = { ...state, drafts, standings: result };
    const leader = cfg.writers.find((w) => w.slug === result[0]!.writer)!;
    await reportProgress(config, 'standings', 85, `Standings published: ${leader.name} leads`, board(next));
    return { drafts, standings: result };
  };
}
