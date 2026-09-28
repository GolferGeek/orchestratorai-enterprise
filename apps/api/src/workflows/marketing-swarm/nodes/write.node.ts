import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { reportProgress, scopeOf } from '../../shared/runs';
import type { WorkUnitService } from '../../shared/work-units';
import { latest, type Draft, type SwarmState } from '../swarm.state';
import { board } from './board';

/**
 * The writers draft (or, with feedback, revise) as one panel, each in its
 * persona on its own model. A writer that fails is recorded as failed; the
 * others go on (a subset of drafts is still a useful comparison).
 */
export function createWriteNode(deps: { units: WorkUnitService; revise: boolean }) {
  return async (state: SwarmState, config: LangGraphRunnableConfig): Promise<Partial<SwarmState>> => {
    const cfg = state.config!;
    const target = deps.revise ? 'revising' : 'writing';
    const working = state.drafts.filter((d) => d.status === target);
    if (!working.length) throw new Error(`No drafts to ${deps.revise ? 'revise' : 'write'}. This is a bug.`);
    const cycle = deps.revise ? state.cycle + 1 : 0;
    await reportProgress(config, deps.revise ? 'rewrite' : 'write', deps.revise ? 50 + cycle * 10 : 15, deps.revise ? `Revising ${working.length} draft(s), round ${cycle}` : `${working.length} writers drafting`, board(state));
    const contentType = { name: cfg.contentType.name, guidance: cfg.contentType.guidance, minWords: cfg.contentType.minWords, maxWords: cfg.contentType.maxWords, maxChars: cfg.contentType.maxChars };
    const panel = await deps.units.runPanel<string>(scopeOf(state), {
      slug: deps.revise ? `rewrite-${cycle}` : 'write',
      panelists: working.map((d) => {
        const writer = cfg.writers.find((w) => w.slug === d.writer)!;
        const previous = latest(d);
        return {
          agent: 'swarm-writer',
          label: writer.name,
          framing: `Your persona:\n${writer.persona}`,
          model: { provider: writer.provider, model: writer.model },
          input: {
            brief: cfg.brief,
            evidence: cfg.evidence,
            contentType,
            revision: deps.revise ? { previousDraft: previous!.text, feedback: previous!.feedback } : null,
          },
        };
      }),
      maxConcurrent: 4,
      policy: { mode: 'allow_partial', minSuccess: 1 },
    });
    const byWriter = new Map(working.map((d, i) => [d.writer, panel.results[i]!]));
    const drafts: Draft[] = state.drafts.map((d) => {
      const result = byWriter.get(d.writer);
      if (!result) return d;
      if (!result.ok) return { ...d, status: 'failed', error: result.error };
      const text = result.output.trim();
      if (!text) return { ...d, status: 'failed', error: 'The writer returned an empty draft' };
      return { ...d, status: 'scoring', versions: [...d.versions, { n: d.versions.length + 1, text, scores: {}, editors: {}, feedback: null }] };
    });
    if (!drafts.some((d) => d.status === 'scoring')) throw new Error(`Every writer failed: ${drafts.map((d) => `${d.writer}: ${d.error}`).join('; ')}`);
    return { drafts, cycle };
  };
}
