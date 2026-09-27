import { WorkflowInputError } from '../../catalog/workflow.registry';
import type { OrgActivity } from '../activity-store.service';
import { execDigestExporter } from '../exec-digest.exporter';
import { execDigestRunTitle, parseExecDigestInput, weekWindow } from '../exec-digest.input';
import { execDigestResult } from '../exec-digest.result';
import type { ExecDigestState } from '../exec-digest.state';
import { companyTotals } from '../exec-digest.totals';

const activity = (organization: string, overrides: Partial<OrgActivity> = {}): OrgActivity => ({
  organization,
  workflowRuns: { 'decision-risk': { completed: 2, failed: 1 } },
  workflowRunsTotal: 3,
  agentConversations: { 'finance-policy-assistant': 4 },
  agentConversationsTotal: 4,
  openReviews: 1,
  modelCalls: 20,
  modelCostUsd: 0.0123,
  ...overrides,
});

describe('exec digest input', () => {
  it('takes departments and an optional week ending', () => {
    expect(parseExecDigestInput({ organizations: ['finance'] })).toEqual({ organizations: ['finance'], weekEnding: null });
    expect(parseExecDigestInput({ organizations: ['finance', 'building'], weekEnding: '2026-09-27' }).weekEnding).toBe('2026-09-27');
    expect(execDigestRunTitle({ organizations: ['finance'], weekEnding: '2026-09-27' })).toBe('Exec digest - week ending 2026-09-27 (finance)');
  });

  it.each([
    [{}, 'at least one department'],
    [{ organizations: ['legal'] }, 'is not one of'],
    [{ organizations: ['finance', 'finance'] }, 'twice'],
    [{ organizations: ['finance'], weekEnding: '27/09/2026' }, 'YYYY-MM-DD'],
    [{ organizations: ['finance'], extra: 1 }, 'unknown fields'],
  ])('refuses %j', (input, message) => {
    expect(() => parseExecDigestInput(input)).toThrow(WorkflowInputError);
    expect(() => parseExecDigestInput(input)).toThrow(message);
  });

  it('covers the seven days ending on the week-ending date', () => {
    expect(weekWindow('2026-09-27')).toEqual({ from: '2026-09-21T00:00:00.000Z', to: '2026-09-28T00:00:00.000Z' });
  });
});

describe('exec digest numbers and result', () => {
  it('adds the company totals up from the departments', () => {
    expect(companyTotals([activity('finance'), activity('engineering', { modelCostUsd: 0.5, workflowRuns: { x: { completed: 1 } }, workflowRunsTotal: 1 })])).toEqual({
      departments: 2,
      workflowRuns: 4,
      workflowRunsByStatus: { completed: 3, failed: 1 },
      agentConversations: 8,
      openReviews: 2,
      modelCalls: 40,
      modelCostUsd: 0.5123,
    });
  });

  it('refuses an incomplete digest, and exports a complete one', async () => {
    const state = {
      weekEnding: '2026-09-27',
      activity: [activity('finance')],
      summaries: [{ organization: 'finance', headline: 'Busy week', summary: 'Three runs.', watch: ['One review waiting'] }],
      companySummary: 'A steady week.',
    } as unknown as ExecDigestState;
    expect(() => execDigestResult({ ...state, companySummary: null } as ExecDigestState)).toThrow('bug');
    const result = execDigestResult(state);
    const doc = execDigestExporter.build({ run: { id: 'r1', result } as never, issues: {} as never, exportedAt: new Date('2026-09-28T00:00:00Z') });
    expect(doc.title).toBe('Weekly Executive Digest - week ending 2026-09-27');
    expect(doc.sections.map((s) => s.heading)).toEqual(['Company', 'By department', 'finance']);
    expect(execDigestExporter.fileName({ run: { result } as never, issues: {} as never, exportedAt: new Date() })).toBe('exec-digest-2026-09-27');
  });
});

describe('exec digest docs', () => {
  it('has a brief, both docs and two examples its parser accepts', async () => {
    const { DEFAULT_WORKFLOW_DOCS_ROOT, WorkflowDocsService } = await import('../../shared/docs/workflow-docs.service');
    const brief = await new WorkflowDocsService(DEFAULT_WORKFLOW_DOCS_ROOT).brief('exec-digest', (input) => parseExecDigestInput(input));
    expect(brief.title).toBe('Weekly Exec Digest');
    expect(brief.docs).toEqual(['user-guide', 'smoke-test']);
    expect(brief.showcase).toHaveLength(2);
  });
});
