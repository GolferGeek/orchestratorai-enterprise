import {
  createComputeScorecardNode,
  computeScorecard,
} from './compute-scorecard.node';
import type { ComplianceAuditState } from '../compliance-audit.state';
import type { ComplianceFinding } from '../compliance-audit.types';

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
} as any;

function makeFinding(overrides: Partial<ComplianceFinding>): ComplianceFinding {
  return {
    id: 'f-' + Math.random().toString(36).slice(2, 8),
    status: 'compliant',
    severity: 'medium',
    frameworkSlug: 'gdpr',
    requirementRef: 'GDPR Art. 5',
    requirementText: 'Test requirement',
    policyCitations: [],
    gapDescription: '',
    remediationRecommendation: '',
    specialistReasoning: '',
    ...overrides,
  };
}

describe('computeScorecard', () => {
  it('returns 100% for all-compliant findings', () => {
    const findings = [
      makeFinding({
        status: 'compliant',
        themeId: 'consent',
        themeName: 'Consent',
      }),
      makeFinding({
        status: 'compliant',
        themeId: 'consent',
        themeName: 'Consent',
      }),
    ];

    const scorecard = computeScorecard(findings, ['gdpr']);
    expect(scorecard.overallScore).toBe(100);
    expect(scorecard.perFramework[0]!.score).toBe(100);
    expect(scorecard.perFramework[0]!.themeScores[0]!.score).toBe(100);
  });

  it('returns 0% for all non-compliant findings', () => {
    const findings = [
      makeFinding({
        status: 'non-compliant',
        themeId: 'breach',
        themeName: 'Breach',
      }),
      makeFinding({
        status: 'non-compliant',
        themeId: 'breach',
        themeName: 'Breach',
      }),
    ];

    const scorecard = computeScorecard(findings, ['gdpr']);
    expect(scorecard.overallScore).toBe(0);
  });

  it('scores partially-compliant as 50%', () => {
    const findings = [
      makeFinding({
        status: 'partially-compliant',
        themeId: 'rights',
        themeName: 'Rights',
      }),
      makeFinding({
        status: 'partially-compliant',
        themeId: 'rights',
        themeName: 'Rights',
      }),
    ];

    const scorecard = computeScorecard(findings, ['gdpr']);
    expect(scorecard.overallScore).toBe(50);
  });

  it('computes mixed scores correctly', () => {
    // 2 compliant (100 each) + 1 partial (50) + 1 non-compliant (0) = 250/4 = 62.5%
    const findings = [
      makeFinding({
        status: 'compliant',
        themeId: 'data',
        themeName: 'Data',
      }),
      makeFinding({
        status: 'compliant',
        themeId: 'data',
        themeName: 'Data',
      }),
      makeFinding({
        status: 'partially-compliant',
        themeId: 'data',
        themeName: 'Data',
      }),
      makeFinding({
        status: 'non-compliant',
        themeId: 'data',
        themeName: 'Data',
      }),
    ];

    const scorecard = computeScorecard(findings, ['gdpr']);
    expect(scorecard.overallScore).toBe(62.5);
  });

  it('groups by framework correctly', () => {
    const findings = [
      makeFinding({
        frameworkSlug: 'gdpr',
        status: 'compliant',
        themeId: 'a',
        themeName: 'A',
      }),
      makeFinding({
        frameworkSlug: 'hipaa',
        status: 'non-compliant',
        themeId: 'b',
        themeName: 'B',
      }),
    ];

    const scorecard = computeScorecard(findings, ['gdpr', 'hipaa']);
    expect(scorecard.perFramework).toHaveLength(2);

    const gdpr = scorecard.perFramework.find(
      (f) => f.frameworkSlug === 'gdpr',
    )!;
    const hipaa = scorecard.perFramework.find(
      (f) => f.frameworkSlug === 'hipaa',
    )!;

    expect(gdpr.score).toBe(100);
    expect(hipaa.score).toBe(0);
  });

  it('groups by theme correctly', () => {
    const findings = [
      makeFinding({
        status: 'compliant',
        themeId: 'consent',
        themeName: 'Consent',
      }),
      makeFinding({
        status: 'non-compliant',
        themeId: 'breach',
        themeName: 'Breach',
      }),
    ];

    const scorecard = computeScorecard(findings, ['gdpr']);
    const themes = scorecard.perFramework[0]!.themeScores;
    expect(themes).toHaveLength(2);

    const consent = themes.find((t) => t.themeId === 'consent')!;
    const breach = themes.find((t) => t.themeId === 'breach')!;
    expect(consent.score).toBe(100);
    expect(breach.score).toBe(0);
  });

  it('handles empty findings gracefully', () => {
    const scorecard = computeScorecard([], ['gdpr']);
    expect(scorecard.overallScore).toBe(0);
    expect(scorecard.perFramework[0]!.score).toBe(0);
    expect(scorecard.perFramework[0]!.themeScores).toEqual([]);
  });

  it('excludes unable-to-evaluate from scoring', () => {
    const findings = [
      makeFinding({
        status: 'compliant',
        themeId: 'data',
        themeName: 'Data',
      }),
      makeFinding({
        status: 'unable-to-evaluate',
        themeId: 'data',
        themeName: 'Data',
      }),
    ];

    // Only 1 counted finding (compliant), so score should be 100%
    const scorecard = computeScorecard(findings, ['gdpr']);
    expect(scorecard.overallScore).toBe(100);
  });

  it('handles scan mode (no themeId) with discovered bucket', () => {
    const findings = [
      makeFinding({ status: 'compliant' }), // no themeId
      makeFinding({ status: 'non-compliant' }), // no themeId
    ];

    const scorecard = computeScorecard(findings, ['gdpr']);
    const themes = scorecard.perFramework[0]!.themeScores;
    expect(themes).toHaveLength(1);
    expect(themes[0]!.themeId).toBe('discovered');
  });

  it('includes correct counts in ThemeScore', () => {
    const findings = [
      makeFinding({
        status: 'compliant',
        themeId: 'mix',
        themeName: 'Mix',
      }),
      makeFinding({
        status: 'partially-compliant',
        themeId: 'mix',
        themeName: 'Mix',
      }),
      makeFinding({
        status: 'non-compliant',
        themeId: 'mix',
        themeName: 'Mix',
      }),
      makeFinding({
        status: 'not-addressed',
        themeId: 'mix',
        themeName: 'Mix',
      }),
    ];

    const scorecard = computeScorecard(findings, ['gdpr']);
    const theme = scorecard.perFramework[0]!.themeScores[0]!;
    expect(theme.compliant).toBe(1);
    expect(theme.partiallyCompliant).toBe(1);
    expect(theme.nonCompliant).toBe(1);
    expect(theme.notAddressed).toBe(1);
    expect(theme.totalQuestions).toBe(4);
  });
});

describe('ComputeScorecardNode', () => {
  const node = createComputeScorecardNode(mockObservability);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('computes scorecard and sets status to awaiting_review', async () => {
    const state = {
      executionContext: {
        orgSlug: 'test-org',
        userId: 'u1',
        conversationId: 'conv-1',
        agentSlug: 'legal-department',
        agentType: 'langgraph',
        provider: 'ollama',
        model: 'gemma3:4b',
      },
      auditContext: { mode: 'scan', frameworkSlugs: ['gdpr'] },
      findings: [
        makeFinding({ status: 'compliant' }),
        makeFinding({ status: 'non-compliant' }),
      ],
    } as unknown as ComplianceAuditState;

    const result = await node(state);
    expect(result.scorecard).toBeDefined();
    expect(result.scorecard!.overallScore).toBe(50);
    expect(result.status).toBe('awaiting_review');
  });

  it('emits progress events', async () => {
    const state = {
      executionContext: {
        orgSlug: 'test-org',
        userId: 'u1',
        conversationId: 'conv-1',
        agentSlug: 'legal-department',
        agentType: 'langgraph',
        provider: 'ollama',
        model: 'gemma3:4b',
      },
      auditContext: { mode: 'scan', frameworkSlugs: ['gdpr'] },
      findings: [],
    } as unknown as ComplianceAuditState;

    await node(state);
    expect(mockObservability.emitProgress).toHaveBeenCalledTimes(2);
  });
});
