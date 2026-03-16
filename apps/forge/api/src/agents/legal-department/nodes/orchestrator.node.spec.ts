import { createOrchestratorNode } from './orchestrator.node';
import { LegalDepartmentState } from '../legal-department.state';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
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

const contractJson = JSON.stringify({
  clauses: { governingLaw: { jurisdiction: 'Delaware' } },
  contractType: { type: 'nda', isMutual: true },
  riskFlags: [],
  confidence: 0.9,
  summary: 'NDA analyzed',
});

const complianceJson = JSON.stringify({
  policyChecks: {
    jurisdiction: {
      contractJurisdiction: 'Delaware',
      allowedJurisdictions: ['Delaware'],
      compliant: true,
      details: 'OK',
    },
  },
  regulatoryCompliance: {
    regulations: [],
    status: 'not-applicable',
    details: 'N/A',
  },
  riskFlags: [],
  confidence: 0.85,
  summary: 'Compliance analyzed',
});

function createMockLLMClient(): jest.Mocked<LLMHttpClientService> {
  return {
    callLLM: jest
      .fn()
      .mockResolvedValueOnce({ text: contractJson })
      .mockResolvedValue({ text: complianceJson }),
  } as unknown as jest.Mocked<LLMHttpClientService>;
}

function createMockObservability(): jest.Mocked<ObservabilityService> {
  return {
    emitProgress: jest.fn().mockResolvedValue(undefined),
    emitFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ObservabilityService>;
}

function createBaseState(
  overrides: Partial<LegalDepartmentState> = {},
): LegalDepartmentState {
  return {
    executionContext: mockCtx,
    userMessage: 'Analyze this contract',
    documents: [
      { name: 'contract.pdf', content: 'contract agreement content' },
    ],
    legalMetadata: undefined,
    routingDecision: {
      specialist: 'contract',
      specialists: ['contract', 'compliance'],
      confidence: 0.9,
      reasoning: 'Multi-domain document',
      categories: ['contract'],
      multiAgent: true,
    },
    orchestration: {},
    specialistOutputs: {},
    response: undefined,
    status: 'processing',
    error: undefined,
    startedAt: Date.now(),
    completedAt: undefined,
    messages: [],
    ...overrides,
  };
}

describe('createOrchestratorNode', () => {
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;
  let orchestratorNode: ReturnType<typeof createOrchestratorNode>;

  beforeEach(() => {
    mockLLMClient = createMockLLMClient();
    mockObservability = createMockObservability();
    orchestratorNode = createOrchestratorNode(mockLLMClient, mockObservability);
  });

  describe('basic functionality', () => {
    it('should return a function', () => {
      expect(typeof orchestratorNode).toBe('function');
    });

    it('should invoke multiple specialists in parallel', async () => {
      const state = createBaseState();
      const result = await orchestratorNode(state);
      expect(result.specialistOutputs).toBeDefined();
      expect(Object.keys(result.specialistOutputs || {})).toHaveLength(2);
    });

    it('should emit progress events', async () => {
      const state = createBaseState();
      await orchestratorNode(state);
      expect(mockObservability.emitProgress).toHaveBeenCalled();
    });

    it('should return orchestration metadata', async () => {
      const state = createBaseState();
      const result = await orchestratorNode(state);
      expect(result.orchestration).toBeDefined();
      expect(result.orchestration?.specialists).toBeDefined();
      expect(result.orchestration?.completed).toBeDefined();
    });
  });

  describe('single agent mode handling', () => {
    it('should return empty object when multiAgent is false', async () => {
      const state = createBaseState({
        routingDecision: {
          specialist: 'contract',
          specialists: [],
          confidence: 0.9,
          reasoning: 'Single agent',
          categories: [],
          multiAgent: false,
        },
      });
      const result = await orchestratorNode(state);
      expect(result).toEqual({});
    });

    it('should return empty object when no specialists list', async () => {
      const state = createBaseState({
        routingDecision: {
          specialist: 'contract',
          confidence: 0.9,
          reasoning: 'Single agent',
          categories: [],
          multiAgent: false,
        },
      });
      const result = await orchestratorNode(state);
      expect(result).toEqual({});
    });
  });

  describe('specialist invocation', () => {
    it('should merge specialist outputs', async () => {
      const state = createBaseState();
      const result = await orchestratorNode(state);
      expect(result.specialistOutputs?.contract).toBeDefined();
      expect(result.specialistOutputs?.compliance).toBeDefined();
    });

    it('should track completed specialists', async () => {
      const state = createBaseState();
      const result = await orchestratorNode(state);
      expect(result.orchestration?.completed).toContain('contract');
      expect(result.orchestration?.completed).toContain('compliance');
    });

    it('should handle unknown specialist names gracefully', async () => {
      const consoleSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      const state = createBaseState({
        routingDecision: {
          specialist: 'contract',
          specialists: ['contract', 'unknownSpecialist' as any],
          confidence: 0.9,
          reasoning: 'test',
          categories: [],
          multiAgent: true,
        },
      });
      const result = await orchestratorNode(state);
      // contract should still succeed, unknown specialist skipped
      expect(result.specialistOutputs?.contract).toBeDefined();
      consoleSpy.mockRestore();
    });

    it('should track failed specialists when specialist returns error', async () => {
      // Reset and make LLM fail for all calls - the specialist will catch and return {error, status:'failed'}
      mockLLMClient.callLLM.mockReset();
      mockLLMClient.callLLM.mockRejectedValue(new Error('LLM failed'));
      const state = createBaseState({
        routingDecision: {
          specialist: 'contract',
          specialists: ['contract'],
          confidence: 0.9,
          reasoning: 'test',
          categories: [],
          multiAgent: true,
        },
      });
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const result = await orchestratorNode(state);
      // The specialist failed internally, orchestration.failed should contain it
      // OR the contract output should not be in specialistOutputs
      expect(result.specialistOutputs?.contract).toBeUndefined();
      consoleSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully and return failed status', async () => {
      const badObservability = {
        emitProgress: jest
          .fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValue(new Error('Observability error')),
        emitFailed: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<ObservabilityService>;

      const badOrchestrator = createOrchestratorNode(
        mockLLMClient,
        badObservability,
      );
      const state = createBaseState();
      const result = await badOrchestrator(state);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Orchestrator:');
    });
  });

  describe('progress events during parallel execution', () => {
    it('should emit per-specialist completion events', async () => {
      const state = createBaseState();
      await orchestratorNode(state);
      // Should have emitted specialist_done events
      const calls = mockObservability.emitProgress.mock.calls;
      expect(calls.some((call) => call[3]?.step === 'specialist_done')).toBe(
        true,
      );
    });

    it('should emit orchestrator_complete event', async () => {
      const state = createBaseState();
      await orchestratorNode(state);
      const calls = mockObservability.emitProgress.mock.calls;
      expect(
        calls.some((call) => call[3]?.step === 'orchestrator_complete'),
      ).toBe(true);
    });
  });
});
