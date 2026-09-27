import type { JsonValue } from '@orchestrator-ai/transport-types';
import { t, type ExportDocument, type WorkflowExporter } from '../shared/export';
import { ONBOARDING_SLUG } from './onboarding.input';
import type { OnboardingResult } from './onboarding.result';

function read(result: JsonValue | null): OnboardingResult {
  const r = result as Partial<OnboardingResult> | null;
  if (!r || !r.hire || !r.plan || !Array.isArray(r.requests)) throw new Error('This plan has no complete result to export.');
  return r as OnboardingResult;
}

const bullets = (items: string[]) => ({ kind: 'bullets' as const, items: items.map((i) => ({ runs: [t(i)] })) });

export const onboardingExporter: WorkflowExporter = {
  slug: ONBOARDING_SLUG,
  fileName: ({ run }) => `onboarding-${read(run.result).hire.fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  build: ({ run, exportedAt }): ExportDocument => {
    const { hire, plan, requests } = read(run.result);
    return {
      title: `Onboarding plan: ${hire.fullName}`,
      generatedAt: exportedAt.toISOString(),
      metadata: [
        { label: 'Role', value: `${hire.roleTitle}, ${hire.team}` },
        { label: 'Manager', value: hire.managerName },
        { label: 'Starts', value: hire.startDate },
        { label: 'Run', value: run.id },
      ],
      sections: [
        { heading: 'Welcome', level: 2, blocks: [{ kind: 'paragraph', runs: [t(plan.welcome)] }] },
        { heading: 'First week', level: 2, blocks: plan.firstWeek.flatMap((d) => [{ kind: 'paragraph' as const, runs: [t(`Day ${d.day}`)] }, bullets(d.items)]) },
        { heading: 'First 30 days', level: 2, blocks: [bullets(plan.plan30)] },
        { heading: 'By 60 days', level: 2, blocks: [bullets(plan.plan60)] },
        { heading: 'By 90 days', level: 2, blocks: [bullets(plan.plan90)] },
        {
          heading: 'Requests',
          level: 2,
          blocks: [{ kind: 'table', headers: ['Kind', 'Request', 'Owner', 'Needed', 'Task'], rows: requests.map((r) => ({ cells: [r.kind, r.item, r.owner, r.neededBy, r.task ? `${r.task.provider} ${r.task.id}` : '-'].map((v) => ({ runs: [t(v)] })) })) }],
        },
      ],
      footer: 'Drafted from HR policy; requests approved by the manager and created as tasks.',
    };
  },
};
