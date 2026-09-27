import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { reportProgress } from '../../shared/runs';
import { ARCHIVE_LOOKBACK_DAYS } from '../competitor-watch.input';
import type { CompetitorWatchState, PageChange, SourceOutcome } from '../competitor-watch.state';
import { diffSegments } from '../diff';
import { segments } from '../page-text';
import type { PageFetcherService } from '../page-fetcher.service';
import type { SourcesStoreService } from '../sources-store.service';

/** At most this many changed regions per page go on to classification. */
export const CHANGES_PER_PAGE = 6;

/**
 * Fetch every followed page, store what it says now, and diff it against the
 * baseline (the last run's copy, or the Internet Archive's). A page that
 * cannot be fetched is reported with its reason and the others go on; if none
 * can be fetched the run fails.
 */
export function createCaptureNode(deps: { store: SourcesStoreService; fetcher: PageFetcherService; now: () => Date }) {
  return async (state: CompetitorWatchState, config: LangGraphRunnableConfig): Promise<Partial<CompetitorWatchState>> => {
    const context = state.executionContext;
    const followed = (await deps.store.list(context.orgSlug)).filter((s) => s.enabled);
    if (followed.length === 0) throw new Error('No competitor pages are followed yet; add them on the Competitor Watch page first.');
    await reportProgress(config, 'capture', 10, `Fetching ${followed.length} competitor page(s)`);

    const sources: SourceOutcome[] = [];
    const changes: PageChange[] = [];
    for (const source of followed) {
      const outcome: SourceOutcome = { sourceId: source.id, competitor: source.competitor, page: source.page, url: source.url, status: 'baseline', baselineFrom: null, error: null };
      try {
        const now = await deps.fetcher.live(source.url);
        await deps.store.save(context.orgSlug, source.id, context.conversationId, { capturedFrom: 'live', archivedAt: null, text: now });
        let before: string | null = null;
        if (state.compareWith === 'last-run') {
          const last = await deps.store.lastLive(source.id, context.conversationId);
          if (last) {
            before = last.text;
            outcome.baselineFrom = last.fetchedAt;
          }
        } else {
          const cutoff = new Date(deps.now().getTime() - ARCHIVE_LOOKBACK_DAYS * 24 * 3600 * 1000);
          const archived = await deps.fetcher.archived(source.url, cutoff);
          await deps.store.save(context.orgSlug, source.id, context.conversationId, { capturedFrom: 'archive', archivedAt: archived.archivedAt, text: archived.text });
          before = archived.text;
          outcome.baselineFrom = archived.archivedAt;
        }
        if (before !== null) {
          outcome.status = 'compared';
          for (const hunk of diffSegments(segments(before), segments(now), CHANGES_PER_PAGE)) {
            changes.push({ sourceId: source.id, competitor: source.competitor, page: source.page, ...hunk, type: null, decision: null, reason: null });
          }
        }
      } catch (error) {
        outcome.status = 'failed';
        outcome.error = (error as Error).message;
      }
      sources.push(outcome);
    }
    if (sources.every((s) => s.status === 'failed')) {
      throw new Error(`No competitor page could be fetched: ${sources.map((s) => `${s.url}: ${s.error}`).join('; ')}`);
    }
    return { sources, changes };
  };
}
