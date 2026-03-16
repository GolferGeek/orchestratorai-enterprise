import {
  createHitlCheckpointNode,
  resumeAfterHitlApproval,
} from './hitl-checkpoint.node';
import { LegalDepartmentState } from '../legal-department.state';
import { ObservabilityService } from '../../shared/services/observability.service';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

const mockCtx: ExecutionContext = {
  orgSlug: 'test-org',
  userId: 'test-user',
  conversationId: 'conv-123',
  taskId: 'task-123',
  planId: 'plan-123',
  deliverableId: 'deliverable-123',
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
    documents: [],
    legalMetadata: undefined,
    routingDecision: undefined,
    orchestration: {},
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
  let mockObservability: jest.Mocked<ObservabilityService>;
  let hitlCheckpointNode: ReturnType<typeof createHitlCheckpointNode>;

  beforeEach(() => {
    mockObservability = createMockObservability();
    hitlCheckpointNode = createHitlCheckpointNode(mockObservability);
  });

  describe('basic functionality', () => {
    it('should return a function', () => {
      expect(typeof hitlCheckpointNode).toBe('function');
    });

    it('should emit progress event', async () => {
      const state = createBaseState();
      await hitlCheckpointNode(state);
      expect(mockObservability.emitProgress).toHaveBeenCalledWith(
        mockCtx,
        'task-123',
        expect.stringContaining('HITL Checkpoint'),
        expect.objectContaining({ reviewRequired: true, autoApproved: true }),
      );
    });

    it('should auto-approve when no hitlDecision in state', async () => {
      const state = createBaseState();
      const result = await hitlCheckpointNode(state);
      expect(result.error).toBeUndefined();
      expect(result.orchestration?.hitlApproved).toBe(true);
    });

    it('should set hitlApprovedAt timestamp on approval', async () => {
      const state = createBaseState();
      const result = await hitlCheckpointNode(state);
      expect(result.orchestration?.hitlApprovedAt).toBeDefined();
      expect(typeof result.orchestration?.hitlApprovedAt).toBe('string');
    });

    it('should preserve existing orchestration data', async () => {
      const state = createBaseState({
        orchestration: {
          specialists: ['contract'],
          completed: ['contract'],
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
      });
      const result = await hitlCheckpointNode(state);
      expect(result.orchestration?.hitlApproved).toBe(true);
      // Existing orchestration data should be preserved by state reducer
    });
  });

  describe('rejection handling', () => {
    it('should return failed status when hitlDecision is rejected', async () => {
      const state = {
        ...createBaseState(),
        hitlDecision: 'rejected',
      } as LegalDepartmentState & { hitlDecision: string };
      const result = await hitlCheckpointNode(state);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('rejected by reviewing attorney');
    });

    it('should return approved status when hitlDecision is approved', async () => {
      const state = {
        ...createBaseState(),
        hitlDecision: 'approved',
      } as LegalDepartmentState & { hitlDecision: string };
      const result = await hitlCheckpointNode(state);
      expect(result.orchestration?.hitlApproved).toBe(true);
    });
  });
});

describe('resumeAfterHitlApproval', () => {
  it('should be callable without throwing', () => {
    const mockObservability = createMockObservability();
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    resumeAfterHitlApproval('thread-1', 'task-1', true, mockObservability);
    consoleSpy.mockRestore();
  });

  it('should log thread and task info', () => {
    const mockObservability = createMockObservability();
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    resumeAfterHitlApproval('thread-abc', 'task-xyz', false, mockObservability);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('thread-abc'),
    );
    consoleSpy.mockRestore();
  });
});
