import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { reportProgress, scopeOf } from '../../shared/runs';
import type { WorkUnitService } from '../../shared/work-units';
import type { CompetitorWatchState, PageChange } from '../competitor-watch.state';

/** A change marketing should hear about: Jev flagged it (block) or thinks it might be (review). */
export const isMaterial = (c: PageChange) => c.decision === 'block' || c.decision === 'review';

/** The digest of material changes; with none, it says so without calling a model. */
export function createSummarizeNode(deps: { units: WorkUnitService }) {
  return async (state: CompetitorWatchState, config: LangGraphRunnableConfig): Promise<Partial<CompetitorWatchState>> => {
    const material = state.changes.filter(isMaterial);
    if (material.length === 0) {
      const compared = state.sources.filter((s) => s.status === 'compared').length;
      return {
        summary: compared === 0
          ? 'First capture: nothing to compare yet. The next run reports what changed since today.'
          : `No material changes on ${compared} page(s).`,
      };
    }
    await reportProgress(config, 'summarize', 80, `Writing up ${material.length} material change(s)`);
    const summary = await deps.units.runSolo<string>(scopeOf(state), {
      slug: 'write-digest',
      agent: 'competitor-watch-writer',
      input: {
        compareWith: state.compareWith,
        changes: material.map((c) => ({ competitor: c.competitor, page: c.page, type: c.type, removed: c.removed, added: c.added, flagged: c.decision === 'block' })),
      },
    });
    return { summary: summary.trim() };
  };
}
