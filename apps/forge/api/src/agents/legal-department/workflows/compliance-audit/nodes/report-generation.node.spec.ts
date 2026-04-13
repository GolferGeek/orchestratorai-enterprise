import { createReportGenerationNode } from './report-generation.node';
import type { ComplianceAuditState } from '../compliance-audit.state';
import type { ComplianceFinding } from '../compliance-audit.types';

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
} as any;

const mockLlmClient = {
  callLLM: jest.fn().mockResolvedValue({ text: 'LLM executive summary here.' }),
} as any;

function makeFinding(overrides: Partial<ComplianceFinding>): ComplianceFinding {
  return {
    id: 'f-' + Math.random().toString(36).slice(2, 8),
    status: 'compliant',
    severity: 'medium',
    frameworkSlug: 'gdpr',
    requirementRef: 'GDPR Art. 5',
    requirementText: 'Test requirement text',
    policyCitations: [
      {
        sectionId: 'sec-1',
        documentName: 'policy.pdf',
        sectionTitle: 'Data Handling',
        excerpt: 'We handle data carefully...',
      },
    ],
    gapDescription: 'No gap found',
    remediationRecommendation: 'No action needed',
    specialistReasoning: 'Full reasoning here.',
    ...overrides,
  };
}

function makeState(
  overrides: Partial<ComplianceAuditState> = {},
): ComplianceAuditState {
  return {
    messages: [],
    executionContext: {
      orgSlug: 'test-org',
      userId: 'u1',
      conversationId: 'ca-test',
      agentSlug: 'legal-department',
      agentType: 'langgraph',
      provider: 'ollama',
      model: 'gemma3:4b',
    },
    auditContext: { mode: 'scan', frameworkSlugs: ['gdpr'] },
    documents: [
      {
        documentId: 'doc-001',
        name: 'policy.pdf',
        content: 'content',
        sizeBytes: 100,
      },
    ],
    policySections: [
      {
        sectionId: 'sec-1',
        documentId: 'doc-001',
        documentName: 'policy.pdf',
        sectionTitle: 'Data Handling',
        sectionText: 'We handle data...',
        complianceDomain: 'data-handling',
      },
    ],
    policyCollectionSlug: 'compliance-audit-ca-test-policies',
    evaluationQueue: [],
    evaluationsCompleted: ['sec-1'],
    evaluationsFailed: {},
    findings: [
      makeFinding({
        id: 'f-1',
        status: 'non-compliant',
        severity: 'critical',
        requirementRef: 'GDPR Art. 33',
        gapDescription: 'Missing breach notification procedure',
        remediationRecommendation: 'Implement 72-hour breach notification',
      }),
      makeFinding({
        id: 'f-2',
        status: 'compliant',
        requirementRef: 'GDPR Art. 5',
      }),
      makeFinding({
        id: 'f-3',
        status: 'partially-compliant',
        severity: 'high',
        requirementRef: 'GDPR Art. 6',
        gapDescription: 'Consent mechanism incomplete',
        remediationRecommendation: 'Add explicit consent form',
      }),
    ],
    scorecard: {
      overallScore: 55,
      perFramework: [
        {
          frameworkSlug: 'gdpr',
          frameworkName: 'GDPR',
          score: 55,
          themeScores: [
            {
              themeId: 'consent',
              themeName: 'Consent',
              frameworkSlug: 'gdpr',
              totalQuestions: 3,
              compliant: 1,
              partiallyCompliant: 1,
              nonCompliant: 1,
              notAddressed: 0,
              score: 50,
            },
          ],
        },
      ],
    },
    remediationPlan: undefined,
    report: undefined,
    hitlDecision: { decision: 'approve' },
    status: 'generating_report',
    error: undefined,
    startedAt: Date.now(),
    completedAt: undefined,
    ...overrides,
  } as ComplianceAuditState;
}

describe('report-generation.node', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates a report with all 6 sections', async () => {
    const node = createReportGenerationNode(mockLlmClient, mockObservability);
    const result = await node(makeState());

    expect(result.status).toBe('completed');
    expect(result.report).toBeDefined();

    const report = result.report!;
    expect(report).toContain('## 1. Executive Summary');
    expect(report).toContain('## 2. Compliance Scorecard');
    expect(report).toContain('## 3. Gap Analysis');
    expect(report).toContain('## 4. Remediation Recommendations');
    expect(report).toContain('## 5. Policy-to-Requirement Mapping');
    expect(report).toContain('## 6. Appendix: Per-Finding Evidence');
  });

  it('includes compliance disclaimer', async () => {
    const node = createReportGenerationNode(mockLlmClient, mockObservability);
    const result = await node(makeState());

    expect(result.report).toContain(
      'AI-assisted analysis and does not constitute a legal opinion',
    );
  });

  it('includes LLM-generated executive summary', async () => {
    const node = createReportGenerationNode(mockLlmClient, mockObservability);
    const result = await node(makeState());

    expect(result.report).toContain('LLM executive summary here.');
    expect(result.report).not.toContain('[Generated executive summary]');
  });

  it('falls back to static summary when LLM fails', async () => {
    const failingLlm = {
      callLLM: jest.fn().mockRejectedValue(new Error('LLM down')),
    } as any;
    const node = createReportGenerationNode(failingLlm, mockObservability);
    const result = await node(makeState());

    expect(result.status).toBe('completed');
    expect(result.report).toContain('compliance scan');
    expect(result.report).toContain('Overall compliance score');
  });

  it('includes scorecard data in report', async () => {
    const node = createReportGenerationNode(mockLlmClient, mockObservability);
    const result = await node(makeState());

    expect(result.report).toContain('55.0%');
    expect(result.report).toContain('GDPR');
    expect(result.report).toContain('Consent');
  });

  it('includes gap analysis with findings', async () => {
    const node = createReportGenerationNode(mockLlmClient, mockObservability);
    const result = await node(makeState());

    expect(result.report).toContain('GDPR Art. 33');
    expect(result.report).toContain('non-compliant');
    expect(result.report).toContain('GDPR Art. 6');
  });

  it('builds remediation plan from actionable findings', async () => {
    const node = createReportGenerationNode(mockLlmClient, mockObservability);
    const result = await node(makeState());

    expect(result.remediationPlan).toBeDefined();
    expect(result.remediationPlan!.length).toBe(2); // non-compliant + partially-compliant

    // First item should be the critical one (highest priority)
    expect(result.remediationPlan![0]!.severity).toBe('critical');
    expect(result.remediationPlan![0]!.priority).toBe(1);

    // Second should be the high severity one
    expect(result.remediationPlan![1]!.severity).toBe('high');
    expect(result.remediationPlan![1]!.priority).toBe(2);
  });

  it('includes policy-to-requirement mapping', async () => {
    const node = createReportGenerationNode(mockLlmClient, mockObservability);
    const result = await node(makeState());

    expect(result.report).toContain('Policy-to-Requirement Mapping');
    expect(result.report).toContain('policy.pdf');
  });

  it('includes appendix with specialist reasoning', async () => {
    const node = createReportGenerationNode(mockLlmClient, mockObservability);
    const result = await node(makeState());

    expect(result.report).toContain('Specialist Reasoning');
    expect(result.report).toContain('Full reasoning here.');
  });

  it('emits progress events', async () => {
    const node = createReportGenerationNode(mockLlmClient, mockObservability);
    await node(makeState());

    expect(mockObservability.emitProgress).toHaveBeenCalledTimes(2);
  });

  it('handles empty findings gracefully', async () => {
    const node = createReportGenerationNode(mockLlmClient, mockObservability);
    const result = await node(makeState({ findings: [] }));

    expect(result.status).toBe('completed');
    expect(result.report).toContain('No findings to report');
    expect(result.remediationPlan).toEqual([]);
  });

  it('handles report generation failure', async () => {
    const failingLlm = {
      callLLM: jest.fn().mockRejectedValue(new Error('LLM down')),
    } as any;
    const failingObs = {
      emitProgress: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Observability down')),
    } as any;
    const node = createReportGenerationNode(failingLlm, failingObs);
    const result = await node(makeState());

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Report generation failed');
  });

  it('includes audit metadata in report header', async () => {
    const node = createReportGenerationNode(mockLlmClient, mockObservability);
    const state = makeState({
      auditContext: {
        mode: 'full-audit',
        frameworkSlugs: ['gdpr', 'hipaa'],
        organizationContext: {
          industry: 'Healthcare',
          jurisdiction: 'EU',
          employeeCount: '200-500',
        },
      },
    });
    const result = await node(state);

    expect(result.report).toContain('Full Audit');
    expect(result.report).toContain('GDPR, HIPAA');
    expect(result.report).toContain('Healthcare');
    expect(result.report).toContain('EU');
  });
});
