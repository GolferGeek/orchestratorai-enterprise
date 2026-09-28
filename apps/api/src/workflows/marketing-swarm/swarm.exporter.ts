import type { JsonValue } from '@orchestrator-ai/transport-types';
import { t, type ExportDocument, type WorkflowExporter } from '../shared/export';
import { proseBlocks } from '../shared/export/prose-blocks';
import { SWARM_SLUG } from './swarm.input';
import type { SwarmResult } from './swarm.result';

function read(result: JsonValue | null): SwarmResult {
  const r = result as Partial<SwarmResult> | null;
  if (!r || !Array.isArray(r.standings) || !Array.isArray(r.drafts)) throw new Error('This swarm run has no complete result to export.');
  return r as SwarmResult;
}

const cell = (text: string) => ({ runs: [t(text)] });

export const swarmExporter: WorkflowExporter = {
  slug: SWARM_SLUG,
  fileName: ({ run }) => `swarm-${read(run.result).topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`,
  build: ({ run, exportedAt }): ExportDocument => {
    const r = read(run.result);
    const name = (slug: string) => r.writers.find((w) => w.slug === slug)?.name ?? slug;
    const finalText = (slug: string) => {
      const d = r.drafts.find((x) => x.writer === slug)!;
      return d.versions[d.versions.length - 1]!.text;
    };
    return {
      title: `Marketing swarm: ${r.topic}`,
      generatedAt: exportedAt.toISOString(),
      metadata: [
        { label: 'Content type', value: r.contentType.name },
        { label: 'Winner', value: r.winner ? `${name(r.winner.writer)}${r.winner.edited ? ' (edited)' : ''}` : 'None picked' },
        { label: 'Run', value: run.id },
      ],
      sections: [
        { heading: 'Brief', level: 2, blocks: proseBlocks(r.brief) },
        r.winner
          ? { heading: `Winner: ${name(r.winner.writer)}`, level: 2, blocks: proseBlocks(r.winner.text) }
          : { heading: 'No winner', level: 2, blocks: [{ kind: 'paragraph', runs: [t(r.declined ?? '')] }] },
        {
          heading: 'Standings',
          level: 2,
          blocks: [{
            kind: 'table',
            headers: ['Place', 'Writer', ...r.evaluators.map((e) => e.name), 'Mean place'],
            rows: r.standings.map((s) => ({
              cells: [String(s.place), name(s.writer), ...r.evaluators.map((e) => `${s.byEvaluator[e.slug]!.place} (${Math.round(s.byEvaluator[e.slug]!.score * 100)})`), String(s.averagePlace)].map(cell),
            })),
          }],
        },
        ...r.standings.map((s) => ({ heading: `${s.place}. ${name(s.writer)}`, level: 3 as const, blocks: proseBlocks(finalText(s.writer)) })),
      ],
      footer: 'Facets scored by Jev; gates, standings and the winner rule computed in code; the winner picked by a person.',
    };
  },
};
