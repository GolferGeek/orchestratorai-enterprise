import {
  COMPLIANCE_AUDIT_JOB_TYPE,
  type AuditContext,
  type ComplianceFinding,
  type ComplianceScorecard,
  type RemediationItem,
  type PolicySection,
  type EvaluationQueueEntry,
} from './compliance-audit.types';

describe('ComplianceAuditTypes', () => {
  it('exports the correct job type constant', () => {
    expect(COMPLIANCE_AUDIT_JOB_TYPE).toBe('compliance-audit');
  });

  it('AuditContext accepts scan mode', () => {
    const ctx: AuditContext = {
      mode: 'scan',
      frameworkSlugs: ['gdpr'],
    };
    expect(ctx.mode).toBe('scan');
    expect(ctx.frameworkSlugs).toEqual(['gdpr']);
  });

  it('AuditContext accepts full-audit mode with optional fields', () => {
    const ctx: AuditContext = {
      mode: 'full-audit',
      frameworkSlugs: ['gdpr', 'hipaa'],
      selectedThemes: ['data-breach-notification'],
      organizationContext: {
        industry: 'healthcare',
        jurisdiction: 'EU',
        employeeCount: '100-500',
      },
    };
    expect(ctx.mode).toBe('full-audit');
    expect(ctx.selectedThemes).toHaveLength(1);
    expect(ctx.organizationContext?.industry).toBe('healthcare');
  });

  it('PolicySection has required fields', () => {
    const section: PolicySection = {
      sectionId: 'sec-1',
      documentId: 'doc-1',
      documentName: 'Privacy Policy.pdf',
      sectionTitle: 'Data Retention',
      sectionText: 'We retain data for 5 years...',
      complianceDomain: 'data-handling',
    };
    expect(section.sectionId).toBe('sec-1');
    expect(section.complianceDomain).toBe('data-handling');
  });

  it('EvaluationQueueEntry discriminates on type field', () => {
    const policyEntry: EvaluationQueueEntry = {
      type: 'policy-section',
      sectionId: 'sec-1',
      sectionText: 'test',
      complianceDomain: 'security',
    };

    const themeEntry: EvaluationQueueEntry = {
      type: 'theme-question',
      frameworkSlug: 'gdpr',
      themeId: 'data-breach',
      themeName: 'Data Breach Notification',
      questionId: 'q1',
      questionText: 'Does the org have a breach notification procedure?',
    };

    expect(policyEntry.type).toBe('policy-section');
    expect(themeEntry.type).toBe('theme-question');
  });

  it('ComplianceFinding supports all status values', () => {
    const statuses = [
      'compliant',
      'partially-compliant',
      'non-compliant',
      'not-addressed',
      'unable-to-evaluate',
    ] as const;

    for (const status of statuses) {
      const finding: ComplianceFinding = {
        id: `f-${status}`,
        status,
        severity: 'medium',
        frameworkSlug: 'gdpr',
        requirementRef: 'Art. 5',
        requirementText: 'test',
        policyCitations: [],
        gapDescription: 'test gap',
        remediationRecommendation: 'fix it',
        specialistReasoning: 'because...',
      };
      expect(finding.status).toBe(status);
    }
  });

  it('ComplianceScorecard has per-framework scores', () => {
    const scorecard: ComplianceScorecard = {
      overallScore: 72.5,
      perFramework: [
        {
          frameworkSlug: 'gdpr',
          frameworkName: 'GDPR',
          score: 72.5,
          themeScores: [
            {
              themeId: 'data-breach',
              themeName: 'Data Breach Notification',
              frameworkSlug: 'gdpr',
              totalQuestions: 5,
              compliant: 3,
              partiallyCompliant: 1,
              nonCompliant: 1,
              notAddressed: 0,
              score: 70,
            },
          ],
        },
      ],
    };
    expect(scorecard.overallScore).toBe(72.5);
    expect(scorecard.perFramework[0]!.themeScores[0]!.score).toBe(70);
  });

  it('RemediationItem has priority and effort', () => {
    const item: RemediationItem = {
      findingId: 'f-1',
      priority: 1,
      severity: 'critical',
      effort: 'medium',
      description: 'Missing breach notification',
      requirement: 'GDPR Art. 33',
      currentState: 'No procedure exists',
      recommendedAction: 'Draft and implement a breach notification procedure',
    };
    expect(item.priority).toBe(1);
    expect(item.effort).toBe('medium');
  });
});
