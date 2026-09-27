import type { JsonValue } from '@orchestrator-ai/transport-types';
import { t, type ExportDocument, type ExportSection, type WorkflowExporter } from '../shared/export';
import { POSTMORTEM_SLUG } from './postmortem.input';
import type { PostmortemResult } from './postmortem.result';

function read(result: JsonValue | null): PostmortemResult {
  const r = result as Partial<PostmortemResult> | null;
  if (!r || !r.postmortem || !r.severity || !Array.isArray(r.actionItems)) throw new Error('This postmortem has no complete result to export.');
  return r as PostmortemResult;
}

const list = (heading: string, items: string[]): ExportSection => ({
  heading,
  level: 2,
  blocks: items.length ? [{ kind: 'bullets', items: items.map((i) => ({ runs: [t(i)] })) }] : [{ kind: 'paragraph', runs: [t('None noted.')] }],
});

export const postmortemExporter: WorkflowExporter = {
  slug: POSTMORTEM_SLUG,
  fileName: ({ run }) => `postmortem-${read(run.result).title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50).replace(/-$/, '')}`,
  build: ({ run, exportedAt }): ExportDocument => {
    const r = read(run.result);
    const p = r.postmortem;
    return {
      title: `Postmortem: ${r.title}`,
      generatedAt: exportedAt.toISOString(),
      metadata: [{ label: 'Severity', value: r.severity }, { label: 'Action items', value: String(r.actionItems.length) }, { label: 'Run', value: run.id }],
      sections: [
        { heading: 'Summary', level: 2, blocks: [{ kind: 'paragraph', runs: [t(p.summary)] }] },
        { heading: 'Impact', level: 2, blocks: [{ kind: 'paragraph', runs: [t(p.impact)] }] },
        { heading: 'Timeline', level: 2, blocks: [{ kind: 'table', headers: ['Time', 'Event'], rows: p.timeline.map((e) => ({ cells: [{ runs: [t(e.time)] }, { runs: [t(e.event)] }] })) }] },
        { heading: 'Root cause', level: 2, blocks: [{ kind: 'paragraph', runs: [t(p.rootCause)] }] },
        list('Contributing factors', p.contributingFactors),
        list('What went well', p.whatWentWell),
        list('Lessons', p.lessons),
        {
          heading: 'Action items',
          level: 2,
          blocks: [{ kind: 'table', headers: ['Priority', 'Action', 'Owner', 'Due', 'Task'], rows: r.actionItems.map((i) => ({ cells: [i.priority, i.title, i.owner, i.due, i.task ? `${i.task.provider} ${i.task.id}` : '-'].map((v) => ({ runs: [t(v)] })) })) }],
        },
      ],
      footer: 'Blameless postmortem. Severity from Jev (incident-severity); action items approved by the incident lead.',
    };
  },
};
