import type { JsonValue } from '@orchestrator-ai/transport-types';
import { b, proseBlocks, t, type ExportDocument, type ExportSection, type WorkflowExporter } from '../shared/export';
import { EXEC_DIGEST_SLUG } from './exec-digest.input';
import type { ExecDigestResult } from './exec-digest.result';

function read(result: JsonValue | null): ExecDigestResult {
  const r = result as Partial<ExecDigestResult> | null;
  if (!r || typeof r.weekEnding !== 'string' || typeof r.companySummary !== 'string' || !Array.isArray(r.departments)) {
    throw new Error('This digest has no complete result to export.');
  }
  return r as ExecDigestResult;
}

const usd = (n: number) => `$${n.toFixed(2)}`;

export const execDigestExporter: WorkflowExporter = {
  slug: EXEC_DIGEST_SLUG,
  fileName: ({ run }) => `exec-digest-${read(run.result).weekEnding}`,
  build: ({ run, exportedAt }): ExportDocument => {
    const r = read(run.result);
    const sections: ExportSection[] = [
      { heading: 'Company', level: 2, blocks: proseBlocks(r.companySummary) },
      {
        heading: 'By department',
        level: 2,
        blocks: [
          {
            kind: 'table',
            headers: ['Department', 'Workflow runs', 'Agent conversations', 'Open reviews', 'Model calls', 'Model cost'],
            rows: r.departments.map((d) => ({
              cells: [d.organization, String(d.activity.workflowRunsTotal), String(d.activity.agentConversationsTotal), String(d.activity.openReviews), String(d.activity.modelCalls), usd(d.activity.modelCostUsd)].map((v) => ({ runs: [t(v)] })),
            })),
          },
        ],
      },
      ...r.departments.map<ExportSection>((d) => ({
        heading: d.organization,
        level: 3,
        blocks: [
          { kind: 'paragraph', runs: [b(d.headline)] },
          { kind: 'paragraph', runs: [t(d.summary)] },
          ...(d.watch.length ? [{ kind: 'bullets' as const, items: d.watch.map((w) => ({ runs: [t(w)] })) }] : []),
        ],
      })),
    ];
    return {
      title: `Weekly Executive Digest - week ending ${r.weekEnding}`,
      generatedAt: exportedAt.toISOString(),
      metadata: [
        { label: 'Workflow runs', value: String(r.totals.workflowRuns) },
        { label: 'Open reviews', value: String(r.totals.openReviews) },
        { label: 'Model cost', value: usd(r.totals.modelCostUsd) },
        { label: 'Run', value: run.id },
      ],
      sections,
      footer: 'Numbers are counted from platform records; summaries are model-written from those numbers only.',
    };
  },
};
