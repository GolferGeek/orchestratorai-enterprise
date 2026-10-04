import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { noulOf } from '../../../decisions';
import { reportProgress, scopeOf } from '../../shared/runs';
import type { WorkUnitService } from '../../shared/work-units';
import { facetScore, lengthScore, type FacetScore } from '../scoring';
import { latest, type Draft, type SwarmState } from '../swarm.state';
import { board } from './board';

const CONCURRENCY = 4;

/**
 * Every facet of every new draft: Jev answers the questions (one check unit
 * per draft, drafts in parallel); length is measured here. A check that
 * cannot run fails the run: a draft is never gated on a facet that was not
 * checked.
 */
export function createCheckNode(deps: { units: WorkUnitService }) {
  return async (state: SwarmState, config: LangGraphRunnableConfig): Promise<Partial<SwarmState>> => {
    const cfg = state.config!;
    const pending = state.drafts.filter((d) => d.status === 'scoring');
    await reportProgress(config, 'check', 30 + state.cycle * 10, `Scoring ${pending.length} draft(s) on ${cfg.facets.length} facets`, board(state));
    const jevFacets = cfg.facets.filter((f) => f.source === 'jev');
    const scored = new Map<string, Record<string, FacetScore>>();
    const queue = [...pending];
    const worker = async () => {
      for (let d = queue.shift(); d; d = queue.shift()) {
        const writer = cfg.writers.find((w) => w.slug === d!.writer)!;
        const text = latest(d)!.text;
        const values = { draft: text, brief: cfg.brief, evidence: cfg.evidence };
        const scores: Record<string, FacetScore> = {};
        if (jevFacets.length) {
          const verdicts = await deps.units.runCheck(scopeOf(state), {
            slug: `check-${state.cycle}-${d.writer}`,
            checks: jevFacets.map((f) => ({
              rubric: f.rubric!,
              label: `${writer.name} · ${f.label}`,
              inputs: Object.fromEntries(Object.entries(f.inputs!).map(([name, from]) => [name, values[from]])),
            })),
          });
          jevFacets.forEach((f, i) => {
            const verdict = verdicts[i]!;
            scores[f.key] = { score: facetScore(f, noulOf(verdict, f.question!)), reason: `${verdict.decision}: ${verdict.reason}` };
          });
        }
        for (const f of cfg.facets.filter((x) => x.source === 'length')) scores[f.key] = lengthScore(text, cfg.contentType);
        scored.set(d.writer, scores);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
    const drafts: Draft[] = state.drafts.map((d) => {
      const scores = scored.get(d.writer);
      if (!scores) return d;
      const versions = [...d.versions];
      versions[versions.length - 1] = { ...versions[versions.length - 1]!, scores };
      return { ...d, versions };
    });
    return { drafts };
  };
}
