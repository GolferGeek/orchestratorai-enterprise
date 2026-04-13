import { createHitlGateNode } from './hitl-gate.node';
import type { ComplianceAuditState } from '../compliance-audit.state';
import type { ComplianceFinding } from '../compliance-audit.types';
import * as langgraph from '@langchain/langgraph';

// Mock LangGraph interrupt
let interruptReturnValue: unknown;
jest.mock('@langchain/langgraph', () => ({
  interrupt: jest.fn(() => interruptReturnValue),
}));
const mockedInterrupt = langgraph.interrupt as jest.MockedFunction<
  typeof langgraph.interrupt
>;

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
    gapDescription: 'Test gap',
    remediationRecommendation: 'Fix it',
    specialistReasoning: 'Because...',
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
      makeFinding({ id: 'f-1', status: 'non-compliant' }),
      makeFinding({ id: 'f-2', status: 'compliant' }),
    ],
    scorecard: {
      overallScore: 50,
      perFramework: [
        {
          frameworkSlug: 'gdpr',
          frameworkName: 'GDPR',
          score: 50,
          themeScores: [],
        },
      ],
    },
    remediationPlan: undefined,
    report: undefined,
    hitlDecision: undefined,
    status: 'awaiting_review',
    error: undefined,
    startedAt: Date.now(),
    completedAt: undefined,
    ...overrides,
  } as ComplianceAuditState;
}

describe('hitl-gate.node', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('emits progress before and after interrupt', async () => {
    interruptReturnValue = { decision: 'approve' };
    const node = createHitlGateNode(mockObservability);
    const state = makeState();

    await node(state);

    expect(mockObservability.emitProgress).toHaveBeenCalledTimes(2);
    expect(mockObservability.emitProgress).toHaveBeenCalledWith(
      state.executionContext,
      'ca-test',
      expect.stringContaining('Awaiting compliance officer review'),
      expect.objectContaining({ reviewRequired: true }),
    );
  });

  it('builds correct review payload shape', async () => {
    interruptReturnValue = { decision: 'approve' };
    const node = createHitlGateNode(mockObservability);
    const state = makeState();

    await node(state);

    const payload = mockedInterrupt.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(payload.gate).toBe('pre-report');
    expect(payload.findings).toEqual(state.findings);
    expect(payload.scorecard).toEqual(state.scorecard);
    expect(payload.auditContext).toEqual(state.auditContext);
    expect(payload.policySections).toEqual(state.policySections);
    expect(payload.totalDocuments).toBe(1);
    expect(payload.evaluationsCompleted).toBe(1);
    expect(payload.evaluationsFailed).toBe(0);
  });

  describe('approve decision', () => {
    it('sets status to generating_report', async () => {
      interruptReturnValue = { decision: 'approve' };
      const node = createHitlGateNode(mockObservability);
      const result = await node(makeState());

      expect(result.status).toBe('generating_report');
      expect(result.hitlDecision).toEqual({ decision: 'approve' });
    });
  });

  describe('reject decision', () => {
    it('clears findings and rebuilds evaluation queue', async () => {
      interruptReturnValue = {
        decision: 'reject',
        feedback: 'Need more detail on breach notification',
      };
      const node = createHitlGateNode(mockObservability);
      const state = makeState();
      const result = await node(state);

      expect(result.status).toBe('evaluating');
      expect(result.findings).toEqual([]);
      expect(result.evaluationsCompleted).toEqual([]);
      expect(result.evaluationsFailed).toEqual({});
      expect(result.scorecard).toBeUndefined();
      expect(result.evaluationQueue).toHaveLength(1);
      expect(result.evaluationQueue![0]).toEqual(
        expect.objectContaining({
          type: 'policy-section',
          sectionId: 'sec-1',
        }),
      );
    });
  });

  describe('modify decision', () => {
    it('merges overridden finding statuses', async () => {
      interruptReturnValue = {
        decision: 'modify',
        editedOutputs: {
          findings: [
            { id: 'f-1', status: 'compliant', gapDescription: 'Resolved' },
          ],
        },
      };
      const node = createHitlGateNode(mockObservability);
      const result = await node(makeState());

      expect(result.status).toBe('generating_report');
      expect(result.findings).toHaveLength(2);

      const modified = result.findings!.find(
        (f: ComplianceFinding) => f.id === 'f-1',
      );
      expect(modified!.status).toBe('compliant');
      expect(modified!.gapDescription).toBe('Resolved');

      // Unmodified finding stays the same
      const unmodified = result.findings!.find(
        (f: ComplianceFinding) => f.id === 'f-2',
      );
      expect(unmodified!.status).toBe('compliant');
    });

    it('handles modify with no matching findings gracefully', async () => {
      interruptReturnValue = {
        decision: 'modify',
        editedOutputs: {
          findings: [{ id: 'nonexistent', status: 'compliant' }],
        },
      };
      const node = createHitlGateNode(mockObservability);
      const state = makeState();
      const result = await node(state);

      // All findings unchanged
      expect(result.findings).toEqual(state.findings);
    });

    it('handles modify with empty editedOutputs', async () => {
      interruptReturnValue = {
        decision: 'modify',
        editedOutputs: {},
      };
      const node = createHitlGateNode(mockObservability);
      const state = makeState();
      const result = await node(state);

      expect(result.findings).toEqual(state.findings);
      expect(result.status).toBe('generating_report');
    });
  });

  describe('unknown decision', () => {
    it('defaults to generating_report', async () => {
      interruptReturnValue = { decision: 'deepen' };
      const node = createHitlGateNode(mockObservability);
      const result = await node(makeState());

      expect(result.status).toBe('generating_report');
    });
  });
});
