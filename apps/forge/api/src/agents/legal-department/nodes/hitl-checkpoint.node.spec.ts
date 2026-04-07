// Replace @langchain/langgraph's `interrupt` with a spy that throws a
// marker error carrying the payload. This lets us unit-test the node
// without standing up a real graph + checkpointer (the real interrupt()
// requires an active AsyncLocalStorage context from a running graph).
jest.mock('@langchain/langgraph', () => ({
  interrupt: jest.fn((value: unknown) => {
    const e = new Error('GraphInterrupt');
    (e as unknown as { interrupts: Array<{ value: unknown }> }).interrupts = [
      { value },
    ];
    (e as unknown as { __interrupt: true }).__interrupt = true;
    throw e;
  }),
}));
import { createHitlCheckpointNode } from './hitl-checkpoint.node';
import { LegalDepartmentState } from '../legal-department.state';
import { ObservabilityService } from '../../shared/services/observability.service';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

const mockCtx: ExecutionContext = {
  orgSlug: 'test-org',
  userId: 'test-user',
  conversationId: 'conv-123',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
};

function createMockObservability(): jest.Mocked<ObservabilityService> {
  return {
    emitProgress: jest.fn().mockResolvedValue(undefined),
    emitStarted: jest.fn().mockResolvedValue(undefined),
    emitCompleted: jest.fn().mockResolvedValue(undefined),
    emitFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ObservabilityService>;
}

function createBaseState(
  overrides: Partial<LegalDepartmentState> = {},
): LegalDepartmentState {
  return {
    executionContext: mockCtx,
    userMessage: 'analyze contract',
    documents: [
      { name: 'nda.pdf', content: 'lorem ipsum', type: 'application/pdf' },
    ],
    legalMetadata: undefined,
    routingDecision: undefined,
    orchestration: {
      synthesis: {
        executiveSummary: 'summary',
        keyFindings: [],
        overallRisk: {
          level: 'medium',
          description: 'medium risk',
          factors: [],
        },
        recommendations: [],
        confidence: 0.8,
      },
    },
    specialistOutputs: {},
    response: 'Contract analysis complete',
    status: 'processing',
    error: undefined,
    startedAt: Date.now(),
    completedAt: undefined,
    messages: [],
    ...overrides,
  };
}

describe('createHitlCheckpointNode', () => {
  it('throws GraphInterrupt on first entry with a review payload', async () => {
    const node = createHitlCheckpointNode(createMockObservability());
    let caught: unknown;
    try {
      await node(createBaseState());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect((caught as { __interrupt?: boolean }).__interrupt).toBe(true);
    // The interrupt payload is on e.interrupts[0].value.
    const interrupts = (caught as { interrupts?: Array<{ value: unknown }> })
      .interrupts;
    expect(interrupts).toBeDefined();
    const payload = interrupts![0]!.value as {
      synthesis: unknown;
      documentsSummary: Array<{ name: string }>;
    };
    expect(payload.synthesis).toBeDefined();
    expect(payload.documentsSummary[0]!.name).toBe('nda.pdf');
  });

  it('emits a progress event announcing the pause', async () => {
    const obs = createMockObservability();
    const node = createHitlCheckpointNode(obs);
    try {
      await node(createBaseState());
    } catch {
      // expected interrupt
    }
    expect(obs.emitProgress).toHaveBeenCalledWith(
      mockCtx,
      'conv-123',
      expect.stringContaining('awaiting attorney review'),
      expect.objectContaining({
        step: 'hitl_checkpoint_start',
        reviewRequired: true,
      }),
    );
  });
});
