import { createReportGenerationNode } from './report-generation.node';
import { LegalDepartmentState } from '../legal-department.state';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../shared/services/observability.service';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

const mockCtx: ExecutionContext = {
  orgSlug: 'test-org',
  userId: 'test-user',
  conversationId: 'conv-123',
  conversationId: 'conv-123',
  planId: 'plan-123',
  deliverableId: 'deliverable-123',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
};

function createMockLLMClient(
  responseText = '# Legal Analysis Report\n\n## Executive Summary\n\nThis contract was analyzed.',
): jest.Mocked<LLMHttpClientService> {
  return {
    callLLM: jest.fn().mockResolvedValue({ text: responseText }),
  } as unknown as jest.Mocked<LLMHttpClientService>;
}

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
    userMessage: 'analyze this contract',
    documents: [{ name: 'contract.pdf', content: 'contract content' }],
    legalMetadata: undefined,
    routingDecision: undefined,
    orchestration: {
      specialists: ['contract'],
      completed: ['contract'],
      hitlApproved: true,
    },
    specialistOutputs: {
      contract: {
        clauses: {},
        riskFlags: [],
        contractType: { type: 'nda', isMutual: true },
        confidence: 0.9,
        summary: 'NDA analyzed',
      },
    },
    response: undefined,
    status: 'processing',
    error: undefined,
    startedAt: Date.now(),
    completedAt: undefined,
    messages: [],
    ...overrides,
  };
}

describe('createReportGenerationNode', () => {
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;
  let reportGenerationNode: ReturnType<typeof createReportGenerationNode>;

  beforeEach(() => {
    mockLLMClient = createMockLLMClient();
    mockObservability = createMockObservability();
    reportGenerationNode = createReportGenerationNode(
      mockLLMClient,
      mockObservability,
    );
  });

  describe('basic functionality', () => {
    it('should return a function', () => {
      expect(typeof reportGenerationNode).toBe('function');
    });

    it('should call LLM with report generation prompt', async () => {
      const state = createBaseState();
      await reportGenerationNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          context: mockCtx,
          callerName: 'legal-department:report-generation',
          temperature: 0.4,
        }),
      );
    });

    it('should return the LLM response as report', async () => {
      const state = createBaseState();
      const result = await reportGenerationNode(state);
      expect(result.response).toContain('Legal Analysis Report');
    });

    it('should emit progress events', async () => {
      const state = createBaseState();
      await reportGenerationNode(state);
      expect(mockObservability.emitProgress).toHaveBeenCalledTimes(3);
    });
  });

  describe('user message building', () => {
    it('should include document name in user message', async () => {
      const state = createBaseState();
      await reportGenerationNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: expect.stringContaining('contract.pdf'),
        }),
      );
    });

    it('should include specialist analyses in user message', async () => {
      const state = createBaseState();
      await reportGenerationNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: expect.stringContaining('CONTRACT'),
        }),
      );
    });

    it('should include synthesis when available', async () => {
      const state = createBaseState({
        orchestration: {
          specialists: ['contract', 'ip'],
          completed: ['contract', 'ip'],
          synthesis: {
            executiveSummary: 'Executive summary here',
            keyFindings: [],
            overallRisk: {
              level: 'medium',
              description: 'moderate risk',
              factors: [],
            },
            recommendations: [],
            confidence: 0.8,
          },
        },
      });
      await reportGenerationNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: expect.stringContaining('Executive Synthesis'),
        }),
      );
    });

    it('should include contracting parties from metadata', async () => {
      const state = createBaseState({
        legalMetadata: {
          documentType: { type: 'NDA', confidence: 0.9 },
          sections: { sections: [], confidence: 0.5, structureType: 'formal' },
          signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
          dates: { dates: [], confidence: 0.5 },
          parties: {
            parties: [],
            contractingParties: [
              {
                name: 'Acme Corp',
                type: 'corporate',
                position: 0,
                confidence: 0.9,
              },
              {
                name: 'Widget Inc',
                type: 'corporate',
                position: 50,
                confidence: 0.9,
              },
            ] as [
              {
                name: string;
                type: string;
                position: number;
                confidence: number;
              },
              {
                name: string;
                type: string;
                position: number;
                confidence: number;
              },
            ],
            confidence: 0.9,
          },
          confidence: {
            overall: 0.9,
            breakdown: {},
            factors: {
              textQuality: 0.9,
              extractionMethod: 'native',
              completeness: 0.9,
              patternMatchCount: 5,
            },
          },
          extractedAt: new Date().toISOString(),
        },
      });
      await reportGenerationNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: expect.stringContaining('Acme Corp'),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should generate fallback report when LLM throws', async () => {
      mockLLMClient.callLLM.mockRejectedValue(new Error('LLM unavailable'));
      const state = createBaseState();
      const result = await reportGenerationNode(state);
      expect(result.response).toContain('Legal Analysis Report');
      expect(result.error).toContain('Report Generation:');
    });

    it('should include document name in fallback report', async () => {
      mockLLMClient.callLLM.mockRejectedValue(new Error('LLM timeout'));
      const state = createBaseState();
      const result = await reportGenerationNode(state);
      expect(result.response).toContain('contract.pdf');
    });

    it("should use 'Document' as default name in fallback when no documents", async () => {
      mockLLMClient.callLLM.mockRejectedValue(new Error('LLM timeout'));
      const state = createBaseState({ documents: [] });
      const result = await reportGenerationNode(state);
      expect(result.response).toContain('Document');
    });

    it('should emit failure event on error', async () => {
      mockLLMClient.callLLM.mockRejectedValue(new Error('LLM timeout'));
      const state = createBaseState();
      await reportGenerationNode(state);
      expect(mockObservability.emitFailed).toHaveBeenCalled();
    });
  });

  describe('fallback report content', () => {
    it('should include specialist names in fallback report', async () => {
      mockLLMClient.callLLM.mockRejectedValue(new Error('LLM failed'));
      const state = createBaseState({
        specialistOutputs: {
          contract: {
            clauses: {},
            riskFlags: [],
            contractType: { type: 'nda', isMutual: true },
            confidence: 0.9,
            summary: 'done',
          },
        },
      });
      const result = await reportGenerationNode(state);
      expect(result.response).toContain('contract');
    });
  });
});
