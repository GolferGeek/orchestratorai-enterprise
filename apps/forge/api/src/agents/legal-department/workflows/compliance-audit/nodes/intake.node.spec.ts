import { createIntakeNode } from './intake.node';
import type { ComplianceAuditState } from '../compliance-audit.state';

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
      name: 'privacy-policy.pdf',
      content: 'We collect personal data...',
      sizeBytes: 500,
    },
  ],
  policySections: [],
  policyCollectionSlug: '',
  evaluationQueue: [],
  evaluationsCompleted: [],
  evaluationsFailed: {},
  findings: [],
  status: 'intake',
  startedAt: Date.now(),
  messages: [],
} as unknown as ComplianceAuditState;

describe('IntakeNode (Compliance Audit)', () => {
  const intakeNode = createIntakeNode(mockObservability);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets policyCollectionSlug from conversationId', async () => {
    const result = await intakeNode(baseState);
    expect(result.policyCollectionSlug).toBe(
      'compliance-audit-conv-ca-1-policies',
    );
  });

  it('transitions status to ingesting', async () => {
    const result = await intakeNode(baseState);
    expect(result.status).toBe('ingesting');
  });

  it('initializes empty evaluation tracking', async () => {
    const result = await intakeNode(baseState);
    expect(result.evaluationsCompleted).toEqual([]);
    expect(result.evaluationsFailed).toEqual({});
    expect(result.findings).toEqual([]);
  });

  it('fails when no frameworks selected', async () => {
    const noFrameworks = {
      ...baseState,
      auditContext: { ...baseState.auditContext, frameworkSlugs: [] },
    } as ComplianceAuditState;

    const result = await intakeNode(noFrameworks);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('at least one regulatory framework');
  });

  it('fails when no documents provided', async () => {
    const noDocs = {
      ...baseState,
      documents: [],
    } as unknown as ComplianceAuditState;

    const result = await intakeNode(noDocs);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('at least one policy document');
  });

  it('emits progress events', async () => {
    await intakeNode(baseState);
    expect(mockObservability.emitProgress).toHaveBeenCalledTimes(2);
    expect(mockObservability.emitProgress).toHaveBeenCalledWith(
      baseState.executionContext,
      'conv-ca-1',
      expect.stringContaining('Initializing compliance audit'),
      expect.objectContaining({ step: 'ca_intake', progress: 2 }),
    );
  });
});
