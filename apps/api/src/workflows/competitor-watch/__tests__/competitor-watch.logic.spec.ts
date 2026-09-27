import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { WorkflowInputError } from '../../catalog/workflow.registry';
import { competitorWatchExporter } from '../competitor-watch.exporter';
import { parseCompetitorWatchInput } from '../competitor-watch.input';
import { competitorWatchResult } from '../competitor-watch.result';
import type { CompetitorWatchState } from '../competitor-watch.state';
import { createCaptureNode } from '../nodes/capture.node';
import { createSummarizeNode } from '../nodes/summarize.node';
import type { PageFetcherService } from '../page-fetcher.service';
import type { SourcesStoreService } from '../sources-store.service';

const config = { configurable: { reportProgress: async () => undefined } };
const context = createMockExecutionContext({ orgSlug: 'marketing', conversationId: 'run-1', agentType: 'workflow' });
const source = (id: string, url: string) => ({ id, competitor: id, page: 'Pricing', url, enabled: true });

function store(sources = [source('posthog', 'https://posthog.com/pricing'), source('down', 'https://down.example/pricing')]) {
  return {
    list: jest.fn(async () => sources),
    save: jest.fn(async () => ({})),
    lastLive: jest.fn(async () => null),
  };
}

describe('competitor watch input', () => {
  it('takes what to compare with, and nothing else', () => {
    expect(parseCompetitorWatchInput({ compareWith: 'last-run' })).toEqual({ compareWith: 'last-run' });
    expect(() => parseCompetitorWatchInput({ compareWith: 'yesterday' })).toThrow(WorkflowInputError);
    expect(() => parseCompetitorWatchInput({ compareWith: 'last-run', x: 1 })).toThrow('unknown fields');
  });
});

describe('capture', () => {
  it('compares with the archive, and reports a page it could not fetch while the others go on', async () => {
    const s = store();
    const fetcher = {
      live: jest.fn(async (url: string) => {
        if (url.includes('down')) throw new Error('down.example answered 503');
        return 'Pricing. Team $69 per user. Free for 2 users.';
      }),
      archived: jest.fn(async () => ({ text: 'Pricing. Team $49 per user. Free for 2 users.', archivedAt: '2026-06-28T16:27:31Z' })),
    };
    const node = createCaptureNode({ store: s as unknown as SourcesStoreService, fetcher: fetcher as unknown as PageFetcherService, now: () => new Date('2026-09-28T00:00:00Z') });
    const out = await node({ executionContext: context, compareWith: 'archive-90-days' } as CompetitorWatchState, config);
    expect(fetcher.archived).toHaveBeenCalledWith('https://posthog.com/pricing', new Date('2026-06-30T00:00:00Z'));
    expect(out.sources).toEqual([
      expect.objectContaining({ sourceId: 'posthog', status: 'compared', baselineFrom: '2026-06-28T16:27:31Z', error: null }),
      expect.objectContaining({ sourceId: 'down', status: 'failed', error: 'down.example answered 503' }),
    ]);
    expect(out.changes).toEqual([expect.objectContaining({ removed: ['Team $49 per user.'], added: ['Team $69 per user.'] })]);
    expect(s.save).toHaveBeenCalledWith('marketing', 'posthog', 'run-1', expect.objectContaining({ capturedFrom: 'archive' }));
  });

  it('records a first capture as a baseline, and fails when no page can be fetched', async () => {
    const s = store([source('posthog', 'https://posthog.com/pricing')]);
    const ok = createCaptureNode({ store: s as unknown as SourcesStoreService, fetcher: { live: async () => 'A.' } as unknown as PageFetcherService, now: () => new Date() });
    expect((await ok({ executionContext: context, compareWith: 'last-run' } as CompetitorWatchState, config)).sources?.[0]?.status).toBe('baseline');
    const down = createCaptureNode({ store: s as unknown as SourcesStoreService, fetcher: { live: async () => { throw new Error('503'); } } as unknown as PageFetcherService, now: () => new Date() });
    await expect(down({ executionContext: context, compareWith: 'last-run' } as CompetitorWatchState, config)).rejects.toThrow('No competitor page could be fetched');
  });
});

describe('summary and result', () => {
  it('says there is nothing material without calling a model, and exports the result', async () => {
    const units = { runSolo: jest.fn() };
    const state = {
      executionContext: context,
      compareWith: 'last-run',
      sources: [{ sourceId: 'p', competitor: 'PostHog', page: 'Pricing', url: 'https://posthog.com/pricing', status: 'compared', baselineFrom: 't', error: null }],
      changes: [{ sourceId: 'p', competitor: 'PostHog', page: 'Pricing', removed: ['(c) 2025'], added: ['(c) 2026'], type: 'noise', decision: 'pass', reason: 'noise' }],
    } as unknown as CompetitorWatchState;
    const out = await createSummarizeNode({ units: units as never })(state, config);
    expect(out.summary).toBe('No material changes on 1 page(s).');
    expect(units.runSolo).not.toHaveBeenCalled();
    const result = competitorWatchResult({ ...state, summary: out.summary! } as CompetitorWatchState);
    expect(result).toMatchObject({ material: [], noise: 1 });
    const doc = competitorWatchExporter.build({ run: { id: 'r', result, queuedAt: '2026-09-28T00:00:00Z', completedAt: null } as never, issues: {} as never, exportedAt: new Date() });
    expect(doc.sections.map((s) => s.heading)).toEqual(['Summary', 'Material changes', 'Pages']);
  });

  it('has a brief, both docs and two examples its parser accepts', async () => {
    const { DEFAULT_WORKFLOW_DOCS_ROOT, WorkflowDocsService } = await import('../../shared/docs/workflow-docs.service');
    const brief = await new WorkflowDocsService(DEFAULT_WORKFLOW_DOCS_ROOT).brief('competitor-watch', (i) => parseCompetitorWatchInput(i));
    expect(brief.showcase).toHaveLength(2);
    expect(brief.docs).toEqual(['user-guide', 'smoke-test']);
  });
});
