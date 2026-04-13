import { createEvaluateFindingNode } from './evaluate-finding.node';
import type { ComplianceAuditState } from '../compliance-audit.state';

const mockLLMResponse = {
  text: JSON.stringify({
    status: 'partially-compliant',
    severity: 'high',
    requirementRef: 'GDPR Art. 5(1)(e)',
    requirementText: 'Storage limitation principle',
    policyCitations: [
      {
        sectionId: 'sec-1',
        documentName: 'privacy-policy.pdf',
        sectionTitle: 'Data Retention',
        excerpt: 'We retain data as long as necessary...',
      },
    ],
    gapDescription:
      'Policy mentions retention but does not define specific retention periods for each data category.',
    remediationRecommendation:
      'Define and document specific retention periods for each category of personal data.',
  }),
  thinkingContent:
    'Analyzed the policy section against GDPR storage limitation...',
};

const mockLlmClient = {
  callLLM: jest.fn().mockResolvedValue(mockLLMResponse),
  callLLMWithReasoning: jest.fn().mockResolvedValue(mockLLMResponse),
} as any;

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
} as any;

const mockWorkflowRag = {
  getContext: jest
    .fn()
    .mockResolvedValue('Relevant regulatory text about data retention...'),
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
  auditContext: { mode: 'scan', frameworkSlugs: ['gdpr'] },
  documents: [],
  policySections: [],
  policyCollectionSlug: 'compliance-audit-conv-ca-1-policies',
  evaluationQueue: [
    {
      type: 'policy-section',
      sectionId: 'sec-1',
      sectionText: 'We retain data as long as necessary for business purposes.',
      complianceDomain: 'data-handling',
    },
  ],
  evaluationsCompleted: [],
  evaluationsFailed: {},
  findings: [],
  status: 'evaluating',
  startedAt: Date.now(),
  messages: [],
} as unknown as ComplianceAuditState;

describe('EvaluateFindingNode', () => {
  const evaluateNode = createEvaluateFindingNode(
    mockLlmClient,
    mockObservability,
    mockWorkflowRag,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pops the first item from the queue', async () => {
    const result = await evaluateNode(baseState);
    expect(result.evaluationQueue).toEqual([]);
  });

  it('adds item ID to evaluationsCompleted', async () => {
    const result = await evaluateNode(baseState);
    expect(result.evaluationsCompleted).toContain('sec-1');
  });

  it('produces a ComplianceFinding with correct shape', async () => {
    const result = await evaluateNode(baseState);
    expect(result.findings).toHaveLength(1);

    const finding = result.findings![0]!;
    expect(finding.id).toBeTruthy();
    expect(finding.status).toBe('partially-compliant');
    expect(finding.severity).toBe('high');
    expect(finding.frameworkSlug).toBe('gdpr');
    expect(finding.requirementRef).toBe('GDPR Art. 5(1)(e)');
    expect(finding.requirementText).toBeTruthy();
    expect(finding.policyCitations).toHaveLength(1);
    expect(finding.gapDescription).toContain('retention periods');
    expect(finding.remediationRecommendation).toBeTruthy();
    expect(finding.specialistReasoning).toBeTruthy();
  });

  it('queries framework RAG with policy section text', async () => {
    await evaluateNode(baseState);
    expect(mockWorkflowRag.getContext).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionSlug: 'framework-gdpr',
        orgSlug: 'test-org',
        query: expect.stringContaining('We retain data'),
        topK: 5,
      }),
    );
  });

  it('queries policy RAG for cross-reference', async () => {
    await evaluateNode(baseState);
    expect(mockWorkflowRag.getContext).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionSlug: 'compliance-audit-conv-ca-1-policies',
        orgSlug: 'test-org',
      }),
    );
  });

  it('handles theme-question entries', async () => {
    const themeState = {
      ...baseState,
      auditContext: { mode: 'full-audit', frameworkSlugs: ['gdpr'] },
      evaluationQueue: [
        {
          type: 'theme-question',
          frameworkSlug: 'gdpr',
          themeId: 'data-consent',
          themeName: 'Data Consent',
          questionId: 'q1',
          questionText: 'Is consent documented?',
        },
      ],
    } as unknown as ComplianceAuditState;

    const result = await evaluateNode(themeState);
    expect(result.findings).toHaveLength(1);
    const finding = result.findings![0]!;
    expect(finding.themeId).toBe('data-consent');
    expect(finding.themeName).toBe('Data Consent');
    expect(finding.questionId).toBe('q1');
  });

  it('returns empty state when queue is already empty', async () => {
    const emptyState = {
      ...baseState,
      evaluationQueue: [],
    } as unknown as ComplianceAuditState;

    const result = await evaluateNode(emptyState);
    expect(result.evaluationQueue).toEqual([]);
    expect(result.findings).toBeUndefined();
  });

  it('handles LLM errors gracefully', async () => {
    mockLlmClient.callLLMWithReasoning.mockRejectedValueOnce(
      new Error('LLM timeout'),
    );

    const result = await evaluateNode(baseState);
    expect(result.evaluationQueue).toEqual([]);
    expect(result.evaluationsFailed).toEqual({ 'sec-1': 'LLM timeout' });
  });

  it('handles malformed LLM response gracefully', async () => {
    mockLlmClient.callLLMWithReasoning.mockResolvedValueOnce({
      text: 'not valid json at all',
      thinkingContent: undefined,
    });

    const result = await evaluateNode(baseState);
    expect(result.findings).toHaveLength(1);
    const finding = result.findings![0]!;
    expect(finding.status).toBe('unable-to-evaluate');
    expect(finding.gapDescription).toContain('not valid json');
  });

  it('emits progress after evaluation', async () => {
    await evaluateNode(baseState);
    expect(mockObservability.emitProgress).toHaveBeenCalledWith(
      baseState.executionContext,
      'conv-ca-1',
      expect.stringContaining('GDPR Art. 5(1)(e)'),
      expect.objectContaining({
        step: 'ca_evaluate_finding',
        status: 'partially-compliant',
        severity: 'high',
      }),
    );
  });
});
