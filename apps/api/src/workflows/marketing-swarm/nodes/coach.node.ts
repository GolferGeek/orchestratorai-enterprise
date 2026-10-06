import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { reportProgress, scopeOf } from '../../shared/runs';
import type { WorkUnitService } from '../../shared/work-units';
import { shortfalls } from '../scoring';
import { latest, type Draft, type SwarmState } from '../swarm.state';
import { board } from './board';

/**
 * Scores go to the coach (a model prompt) at two decimals: the coach needs
 * "0.44", not "0.4444444444444444", and a 16-digit fraction reads like a card
 * number to the PII boundary.
 */
const twoPlaces = (n: number): number => Math.round(n * 100) / 100;

/**
 * For each draft going back, the coach turns the editors' shortfalls (their
 * weighted facets, worst first) into feedback the writer can act on. The
 * coach explains; it does not score, approve or rewrite.
 */
export function createCoachNode(deps: { units: WorkUnitService }) {
  return async (state: SwarmState, config: LangGraphRunnableConfig): Promise<Partial<SwarmState>> => {
    const cfg = state.config!;
    const labels = Object.fromEntries(cfg.facets.map((f) => [f.key, f.label]));
    const going = state.drafts.filter((d) => d.status === 'revising');
    await reportProgress(config, 'coach', 45 + state.cycle * 10, `Coaching ${going.length} draft(s)`, board(state));
    const panel = await deps.units.runPanel<{ feedback: string }>(scopeOf(state), {
      slug: `coach-${state.cycle}`,
      panelists: going.map((d) => {
        const v = latest(d)!;
        return {
          agent: 'swarm-coach',
          label: cfg.writers.find((w) => w.slug === d.writer)!.name,
          input: {
            brief: cfg.brief,
            draft: v.text,
            shortfalls: cfg.editors
              .filter((e) => !v.editors[e.slug]!.pass)
              .map((e) => ({
                editor: e.name,
                score: twoPlaces(v.editors[e.slug]!.score),
                needs: e.threshold,
                facets: shortfalls(e.weights, v.scores, labels).map((f) => ({ ...f, score: twoPlaces(f.score) })),
              })),
          },
        };
      }),
      maxConcurrent: 4,
      policy: { mode: 'fail_all' },
    });
    const byWriter = new Map(going.map((d, i) => [d.writer, panel.results[i]!]));
    const drafts: Draft[] = state.drafts.map((d) => {
      const result = byWriter.get(d.writer);
      if (!result) return d;
      if (!result.ok) throw new Error(`No feedback for ${d.writer}: ${result.error}`);
      const versions = [...d.versions];
      versions[versions.length - 1] = { ...versions[versions.length - 1]!, feedback: result.output.feedback.trim() };
      return { ...d, versions };
    });
    return { drafts };
  };
}
