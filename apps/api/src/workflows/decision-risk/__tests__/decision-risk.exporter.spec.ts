import type { IssueLedgerView } from '@orchestrator-ai/transport-types';
import { ExportService } from '../../shared/export';
import type { WorkflowRunRecord } from '../../shared/runs';
import { buildDecisionRiskDocument, decisionRiskExporter, readStoredResult } from '../decision-risk.exporter';

const result = {
  overallScore: 58,
  overallConfidence: 0.72,
  residualScore: 41,
  executiveSummary: 'Proceed with conditions.\n\nThe legal exposure drives the score.',
  dimensions: [
    { slug: 'financial', name: 'Financial', score: 40, confidence: 0.8, reasoning: 'r', evidence: [] },
    { slug: 'legal', name: 'Legal', score: 72, confidence: 0.6, reasoning: 'r', evidence: [] },
  ],
  debate: { originalScore: 62, finalScore: 58, adjustment: -4 },
  mitigations: [{ dimensionSlug: 'legal', proposal: 'Retain German counsel', rationale: 'Entity setup', effort: 'medium', residualScore: 45 }],
  monteCarlo: {
    composite: { trials: 10000, mean: 58, median: 58, p10: 49, p90: 67, p05: 46, p95: 70, standardDeviation: 7, probabilityAboveAlert: 0.03, alertThreshold: 80 },
    residual: null,
  },
};

const issues: IssueLedgerView = {
  runId: 'run-1',
  issues: [
    {
      issueId: 'i1', stageSlug: 'risk-radar', issueKey: 'dimension:legal', source: 'risk-radar', status: 'accepted',
      severity: 'high', category: 'legal', title: 'Legal risk scores 72', finding: 'f', recommendedAction: null, subject: null,
      lastChange: { actor: 'review:approve-mitigations#0', rationale: 'Mitigation: Retain German counsel', at: 't' },
      createdAt: 't', updatedAt: 't',
    },
  ],
  summary: { total: 1, open: 1, byStatus: {} as never, bySeverity: {} as never },
};

const run = {
  id: 'run-1',
  organizationSlug: 'corporate',
  workflowSlug: 'decision-risk',
  status: 'completed',
  input: { proposition: 'Open a Berlin office', background: 'No German entity yet.' },
  result,
  completedAt: '2026-09-27T12:00:00.000Z',
} as unknown as WorkflowRunRecord;

const source = { run, issues, exportedAt: new Date('2026-09-27T13:00:00Z') };

describe('decision-risk export', () => {
  it('leads with the verdict and carries the evidence, mitigations and issues', async () => {
    const doc = buildDecisionRiskDocument(source);
    expect(doc.metadata.slice(0, 3)).toEqual([
      { label: 'Composite risk', value: '58' },
      { label: 'If mitigated', value: '41' },
      { label: 'Confidence', value: '72%' },
    ]);
    expect(doc.sections.map((s) => s.heading)).toEqual([
      'Proposition', 'Executive summary', 'Risk by dimension', 'Red team', 'Approved mitigations', 'Issues', 'Uncertainty',
    ]);
    expect(doc.sections[1]!.blocks).toHaveLength(2);

    const md = (await new ExportService().render(doc, 'md')).toString('utf-8');
    expect(md).toContain('Open a Berlin office');
    expect(md.indexOf('Legal')).toBeLessThan(md.indexOf('Financial'));
    expect(md).toContain('Retain German counsel');
    expect(md).toContain('Legal risk scores 72');
    expect(md).toContain('49 to 67');

    for (const format of ['docx', 'pdf'] as const) {
      expect((await new ExportService().render(doc, format)).length).toBeGreaterThan(1000);
    }
  });

  it('refuses a result that is missing its score or summary', () => {
    expect(() => readStoredResult({ overallScore: 50 })).toThrow('no complete result');
    expect(() => readStoredResult(null)).toThrow('no complete result');
  });

  it('names the file after the proposition', () => {
    expect(decisionRiskExporter.fileName(source)).toBe('decision-risk-open-a-berlin-office');
    const long = { ...run, input: { proposition: 'Open a second office in Berlin next quarter to serve EU clients' } } as WorkflowRunRecord;
    expect(decisionRiskExporter.fileName({ ...source, run: long })).toBe('decision-risk-open-a-second-office-in-berlin-next-quarter-to-serve-eu');
  });
});
