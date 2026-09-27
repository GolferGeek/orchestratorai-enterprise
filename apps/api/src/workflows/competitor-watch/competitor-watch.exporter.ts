import type { JsonValue } from '@orchestrator-ai/transport-types';
import { b, t, type ExportDocument, type WorkflowExporter } from '../shared/export';
import { COMPETITOR_WATCH_SLUG } from './competitor-watch.input';
import type { CompetitorWatchResult } from './competitor-watch.result';

function read(result: JsonValue | null): CompetitorWatchResult {
  const r = result as Partial<CompetitorWatchResult> | null;
  if (!r || typeof r.summary !== 'string' || !Array.isArray(r.sources) || !Array.isArray(r.material)) {
    throw new Error('This watch has no complete result to export.');
  }
  return r as CompetitorWatchResult;
}

export const competitorWatchExporter: WorkflowExporter = {
  slug: COMPETITOR_WATCH_SLUG,
  fileName: ({ run }) => `competitor-watch-${(run.completedAt ?? run.queuedAt).slice(0, 10)}`,
  build: ({ run, exportedAt }): ExportDocument => {
    const r = read(run.result);
    return {
      title: 'Competitor Watch',
      generatedAt: exportedAt.toISOString(),
      metadata: [
        { label: 'Compared with', value: r.compareWith === 'last-run' ? 'the last run' : 'the Internet Archive, about 90 days ago' },
        { label: 'Material changes', value: String(r.material.length) },
        { label: 'Noise filtered', value: String(r.noise) },
        { label: 'Run', value: run.id },
      ],
      sections: [
        { heading: 'Summary', level: 2, blocks: r.summary.split(/\n\s*\n/).map((p) => ({ kind: 'paragraph', runs: [t(p.trim())] })) },
        {
          heading: 'Material changes',
          level: 2,
          blocks: r.material.length
            ? [{ kind: 'numbered', items: r.material.map((c) => ({ primary: [b(`${c.competitor} ${c.page}: `), t(c.type ?? '')], details: [
                ...(c.removed.length ? [{ label: 'Removed', value: c.removed.join(' ') }] : []),
                ...(c.added.length ? [{ label: 'Added', value: c.added.join(' ') }] : []),
              ] })) }]
            : [{ kind: 'paragraph', runs: [t('None.')] }],
        },
        {
          heading: 'Pages',
          level: 2,
          blocks: [{ kind: 'table', headers: ['Competitor', 'Page', 'Status', 'Compared with'], rows: r.sources.map((s) => ({ cells: [s.competitor, s.page, s.status === 'failed' ? `failed: ${s.error}` : s.status, s.baselineFrom ?? '-'].map((v) => ({ runs: [t(v)] })) })) }],
        },
      ],
      footer: 'Changes are found by comparing page text; Jev classifies each; only material ones are written up.',
    };
  },
};
