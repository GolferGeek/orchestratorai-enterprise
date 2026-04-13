import { createCrossReferenceLoopNode } from './cross-reference-loop.node';
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
  auditContext: { mode: 'scan', frameworkSlugs: ['gdpr'] },
  documents: [],
  policySections: [],
  policyCollectionSlug: '',
  evaluationQueue: [
    {
      type: 'policy-section',
      sectionId: 'sec-1',
      sectionText: 'We collect data...',
      complianceDomain: 'data-handling',
    },
    {
      type: 'policy-section',
      sectionId: 'sec-2',
      sectionText: 'Security measures...',
      complianceDomain: 'security',
    },
  ],
  evaluationsCompleted: ['sec-0'],
  evaluationsFailed: {},
  findings: [],
  status: 'evaluating',
  startedAt: Date.now(),
  messages: [],
} as unknown as ComplianceAuditState;

describe('CrossReferenceLoopNode', () => {
  const loopNode = createCrossReferenceLoopNode(mockObservability);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty partial (stateless dispatcher)', async () => {
    const result = await loopNode(baseState);
    expect(result).toEqual({});
  });

  it('emits progress with queue position', async () => {
    await loopNode(baseState);
    expect(mockObservability.emitProgress).toHaveBeenCalledTimes(1);
    expect(mockObservability.emitProgress).toHaveBeenCalledWith(
      baseState.executionContext,
      'conv-ca-1',
      expect.stringContaining('Cross-referencing'),
      expect.objectContaining({
        remaining: 2,
        completed: 1,
        failed: 0,
      }),
    );
  });

  it('calculates progress in 25-75 range', async () => {
    await loopNode(baseState);
    const progressArg = mockObservability.emitProgress.mock.calls[0]![3];
    expect(progressArg.progress).toBeGreaterThanOrEqual(25);
    expect(progressArg.progress).toBeLessThanOrEqual(75);
  });

  it('handles empty queue gracefully', async () => {
    const emptyQueue = {
      ...baseState,
      evaluationQueue: [],
      evaluationsCompleted: ['sec-0', 'sec-1', 'sec-2'],
    } as unknown as ComplianceAuditState;

    const result = await loopNode(emptyQueue);
    expect(result).toEqual({});
    expect(mockObservability.emitProgress).toHaveBeenCalled();
  });

  it('shows theme-question label for theme entries', async () => {
    const themeState = {
      ...baseState,
      evaluationQueue: [
        {
          type: 'theme-question',
          frameworkSlug: 'gdpr',
          themeId: 'data-consent',
          themeName: 'Data Consent',
          questionId: 'q1',
          questionText: 'Is consent documented for each processing activity?',
        },
      ],
    } as unknown as ComplianceAuditState;

    await loopNode(themeState);
    const messageArg = mockObservability.emitProgress.mock.calls[0]![2];
    expect(messageArg).toContain('theme: Data Consent');
  });
});
