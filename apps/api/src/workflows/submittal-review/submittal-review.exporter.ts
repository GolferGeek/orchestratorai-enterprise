import type { JsonValue } from '@orchestrator-ai/transport-types';
import { proseBlocks, t, type ExportDocument, type WorkflowExporter } from '../shared/export';
import { ACTION_LABELS } from './findings';
import { SUBMITTAL_REVIEW_SLUG } from './submittal-review.input';
import type { SubmittalReviewResult } from './submittal-review.result';

function read(result: JsonValue | null): SubmittalReviewResult {
  const r = result as Partial<SubmittalReviewResult> | null;
  if (!r || !r.action || typeof r.letter !== 'string' || !Array.isArray(r.findings)) throw new Error('This review has no complete result to export.');
  return r as SubmittalReviewResult;
}

export const submittalReviewExporter: WorkflowExporter = {
  slug: SUBMITTAL_REVIEW_SLUG,
  fileName: ({ run }) => `submittal-${read(run.result).specSection.replace(/ /g, '')}-${run.id.slice(0, 8)}`,
  build: ({ run, exportedAt }): ExportDocument => {
    const r = read(run.result);
    return {
      title: `Submittal Review - Section ${r.specSection}: ${ACTION_LABELS[r.action]}`,
      generatedAt: exportedAt.toISOString(),
      metadata: [{ label: 'Action', value: ACTION_LABELS[r.action] }, { label: 'Requirements checked', value: String(r.findings.length) }, { label: 'Run', value: run.id }],
      sections: [
        { heading: 'Response', level: 2, blocks: proseBlocks(r.letter) },
        {
          heading: 'Findings',
          level: 2,
          blocks: [{
            kind: 'table',
            headers: ['Ref', 'Requirement', 'Finding', 'Evidence', 'Note'],
            rows: r.findings.map((f) => ({ cells: [f.ref, f.requirement, f.status, f.evidence ? `${f.evidence}${f.evidenceVerified === false ? ' (not found in the submittal)' : ''}` : '-', f.note].map((v) => ({ runs: [t(v)] })) })),
          }],
        },
      ],
      footer: 'Requirements from the project manual; evidence quotes verified by Jev (citation-in-record).',
    };
  },
};
