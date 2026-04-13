import { createIngestPoliciesNode } from './ingest-policies.node';
import type { ComplianceAuditState } from '../compliance-audit.state';

const mockLLMClient = {
  callLLM: jest.fn().mockResolvedValue({
    text: JSON.stringify({
      sections: [
        {
          title: 'Data Retention Policy',
          text: 'We retain personal data for 5 years...',
          complianceDomain: 'data-handling',
        },
        {
          title: 'Access Control Procedures',
          text: 'Only authorized personnel may access...',
          complianceDomain: 'security',
        },
      ],
    }),
  }),
} as any;

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
} as any;

const baseState: ComplianceAuditState = {
  executionContext: {
    orgSlug: 'test-org',
    userId: 'u1',
    conversationId: 'conv-ca-1',
    agentSlug: 'legal-department',
    agentType: 'langgraph',
    provider: 'ollama',
    model: 'gemma3:4b',
  },
  auditContext: {
    mode: 'scan',
    frameworkSlugs: ['gdpr'],
  },
  documents: [
    {
      documentId: 'doc-001',
      name: 'company-policy.pdf',
      content:
        'Section 1: Data Retention\nWe retain data...\n\nSection 2: Access Control\nOnly authorized...',
      sizeBytes: 200,
    },
  ],
  policySections: [],
  policyCollectionSlug: 'compliance-audit-conv-ca-1-policies',
  evaluationQueue: [],
  evaluationsCompleted: [],
  evaluationsFailed: {},
  findings: [],
  status: 'ingesting',
  startedAt: Date.now(),
  messages: [],
} as unknown as ComplianceAuditState;

describe('IngestPoliciesNode', () => {
  const ingestNode = createIngestPoliciesNode(mockLLMClient, mockObservability);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('segments documents into policy sections via LLM', async () => {
    const result = await ingestNode(baseState);
    expect(result.policySections).toBeDefined();
    expect(result.policySections!.length).toBe(2);
    expect(result.policySections![0]!.sectionTitle).toBe(
      'Data Retention Policy',
    );
    expect(result.policySections![0]!.complianceDomain).toBe('data-handling');
    expect(result.policySections![1]!.sectionTitle).toBe(
      'Access Control Procedures',
    );
  });

  it('assigns unique sectionIds to each section', async () => {
    const result = await ingestNode(baseState);
    const ids = result.policySections!.map((s) => s.sectionId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('preserves documentId on sections', async () => {
    const result = await ingestNode(baseState);
    for (const section of result.policySections!) {
      expect(section.documentId).toBe('doc-001');
      expect(section.documentName).toBe('company-policy.pdf');
    }
  });

  it('builds evaluation queue for scan mode', async () => {
    const result = await ingestNode(baseState);
    expect(result.evaluationQueue).toBeDefined();
    expect(result.evaluationQueue!.length).toBe(2);
    expect(result.evaluationQueue![0]!.type).toBe('policy-section');
  });

  it('builds theme-question queue for full-audit mode', async () => {
    const fullAuditState = {
      ...baseState,
      auditContext: {
        ...baseState.auditContext,
        mode: 'full-audit' as const,
        frameworkSlugs: ['gdpr'],
      },
    } as ComplianceAuditState;

    const result = await ingestNode(fullAuditState);
    expect(result.evaluationQueue!.length).toBeGreaterThan(0);
    expect(result.evaluationQueue![0]!.type).toBe('theme-question');
  });

  it('transitions status to evaluating', async () => {
    const result = await ingestNode(baseState);
    expect(result.status).toBe('evaluating');
  });

  it('handles LLM returning invalid JSON gracefully', async () => {
    const badLLM = {
      callLLM: jest.fn().mockResolvedValue({
        text: 'not valid json at all',
      }),
    } as any;

    const node = createIngestPoliciesNode(badLLM, mockObservability);
    const result = await node(baseState);

    // Should fall back to treating entire document as one section
    expect(result.policySections!.length).toBe(1);
    expect(result.policySections![0]!.sectionTitle).toBe('company-policy.pdf');
    expect(result.policySections![0]!.complianceDomain).toBe('general');
  });

  it('emits progress per document', async () => {
    await ingestNode(baseState);
    // At least 2 calls: one per-document + one completion
    expect(
      mockObservability.emitProgress.mock.calls.length,
    ).toBeGreaterThanOrEqual(2);
  });
});
