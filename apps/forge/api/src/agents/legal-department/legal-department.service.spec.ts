import { Test, TestingModule } from '@nestjs/testing';
import { MemorySaver } from '@langchain/langgraph';
import { LegalDepartmentService } from './legal-department.service';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

const mockCtx: ExecutionContext = {
  orgSlug: 'test-org',
  userId: 'test-user',
  conversationId: 'conv-123',
  conversationId: 'conv-service-123',
  planId: 'plan-123',
  deliverableId: 'deliverable-123',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
};

// Build a minimal mock graph that resolves quickly
function createMockGraph() {
  return {
    invoke: jest.fn().mockResolvedValue({
      status: 'completed',
      response: 'Test response from legal agent',
      specialistOutputs: {
        contract: {
          summary: 'NDA analyzed',
          riskFlags: [],
          confidence: 0.9,
          contractType: { type: 'nda', isMutual: true },
          clauses: {},
        },
      },
      legalMetadata: undefined,
      routingDecision: {
        specialist: 'contract',
        confidence: 0.9,
        reasoning: 'test',
        categories: ['contract'],
        multiAgent: false,
      },
    }),
    getState: jest.fn().mockResolvedValue({
      values: {
        status: 'completed',
        userMessage: 'test message',
        response: 'Test response',
        error: undefined,
      },
    }),
    getStateHistory: jest.fn().mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield {
          values: {
            status: 'completed',
            userMessage: 'test',
            response: 'resp',
            error: undefined,
          },
        };
      },
    }),
  };
}

describe('LegalDepartmentService', () => {
  let service: LegalDepartmentService;
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;
  let mockCheckpointer: jest.Mocked<PostgresCheckpointerService>;
  let mockGraph: ReturnType<typeof createMockGraph>;

  const memorySaver = new MemorySaver();

  beforeEach(async () => {
    mockGraph = createMockGraph();

    mockLLMClient = {
      callLLM: jest.fn().mockResolvedValue({
        text: '{"clauses":{},"contractType":{"type":"nda","isMutual":true},"riskFlags":[],"confidence":0.9,"summary":"test"}',
      }),
    } as unknown as jest.Mocked<LLMHttpClientService>;

    mockObservability = {
      emitProgress: jest.fn().mockResolvedValue(undefined),
      emitStarted: jest.fn().mockResolvedValue(undefined),
      emitCompleted: jest.fn().mockResolvedValue(undefined),
      emitFailed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ObservabilityService>;

    mockCheckpointer = {
      getSaver: jest.fn().mockResolvedValue(memorySaver),
    } as unknown as jest.Mocked<PostgresCheckpointerService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LegalDepartmentService,
        { provide: LLMHttpClientService, useValue: mockLLMClient },
        { provide: ObservabilityService, useValue: mockObservability },
        { provide: PostgresCheckpointerService, useValue: mockCheckpointer },
      ],
    }).compile();

    service = module.get<LegalDepartmentService>(LegalDepartmentService);

    // Manually inject the mock graph to avoid running full graph
    (service as any).graph = mockGraph;
  });

  describe('onModuleInit', () => {
    it('should initialize the graph', async () => {
      // Re-initialize to test the actual init
      const freshModule: TestingModule = await Test.createTestingModule({
        providers: [
          LegalDepartmentService,
          { provide: LLMHttpClientService, useValue: mockLLMClient },
          { provide: ObservabilityService, useValue: mockObservability },
          { provide: PostgresCheckpointerService, useValue: mockCheckpointer },
        ],
      }).compile();

      const freshService = freshModule.get<LegalDepartmentService>(
        LegalDepartmentService,
      );
      await freshService.onModuleInit();
      expect((freshService as any).graph).toBeDefined();
    });
  });

  describe('process', () => {
    it('should process a simple message and return completed status', async () => {
      const result = await service.process({
        context: mockCtx,
        userMessage: 'What does this contract mean?',
      });

      expect(result.conversationId).toBe('task-service-123');
      expect(result.status).toBe('completed');
      expect(result.response).toBe('Test response from legal agent');
    });

    it('should pass documents to the graph', async () => {
      await service.process({
        context: mockCtx,
        userMessage: 'Analyze this document',
        documents: [{ name: 'doc.pdf', content: 'content' }],
      });

      expect(mockGraph.invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          documents: [{ name: 'doc.pdf', content: 'content' }],
        }),
        expect.any(Object),
      );
    });

    it('should pass legalMetadata to the graph', async () => {
      const metadata = {
        documentType: { type: 'NDA', confidence: 0.9 },
        sections: {
          sections: [],
          confidence: 0.5,
          structureType: 'formal' as const,
        },
        signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
        dates: { dates: [], confidence: 0.5 },
        parties: { parties: [], confidence: 0.5 },
        confidence: {
          overall: 0.9,
          breakdown: {},
          factors: {
            textQuality: 0.9,
            extractionMethod: 'native' as const,
            completeness: 0.9,
            patternMatchCount: 5,
          },
        },
        extractedAt: new Date().toISOString(),
      };

      await service.process({
        context: mockCtx,
        userMessage: 'Analyze this NDA',
        legalMetadata: metadata,
      });

      expect(mockGraph.invoke).toHaveBeenCalledWith(
        expect.objectContaining({ legalMetadata: metadata }),
        expect.any(Object),
      );
    });

    it('should use taskId as thread_id config', async () => {
      await service.process({
        context: mockCtx,
        userMessage: 'test',
      });

      expect(mockGraph.invoke).toHaveBeenCalledWith(expect.any(Object), {
        configurable: { thread_id: 'task-service-123' },
      });
    });

    it('should return failed status when graph returns failed status', async () => {
      mockGraph.invoke.mockResolvedValue({
        status: 'failed',
        error: 'Something went wrong',
        response: undefined,
        specialistOutputs: {},
        legalMetadata: undefined,
        routingDecision: undefined,
      });

      const result = await service.process({
        context: mockCtx,
        userMessage: 'test',
      });

      expect(result.status).toBe('failed');
    });

    it('should return specialist outputs in result', async () => {
      const result = await service.process({
        context: mockCtx,
        userMessage: 'Analyze',
      });

      expect(result.specialistOutputs).toBeDefined();
      expect(result.specialistOutputs?.contract).toBeDefined();
    });

    it('should handle graph errors and emit failure event', async () => {
      mockGraph.invoke.mockRejectedValue(new Error('Graph execution failed'));

      const result = await service.process({
        context: mockCtx,
        userMessage: 'test',
      });

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Graph execution failed');
      expect(mockObservability.emitFailed).toHaveBeenCalled();
    });

    it('should include duration in result', async () => {
      const result = await service.process({
        context: mockCtx,
        userMessage: 'test',
      });

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getStatus', () => {
    it('should return task status when graph state exists', async () => {
      const status = await service.getStatus('task-service-123');

      expect(status).toBeDefined();
      expect(status?.conversationId).toBe('task-service-123');
      expect(status?.status).toBe('completed');
    });

    it('should return null when graph state has no values', async () => {
      mockGraph.getState.mockResolvedValue({ values: null });

      const status = await service.getStatus('nonexistent-task');
      expect(status).toBeNull();
    });

    it('should return null when getState throws', async () => {
      mockGraph.getState.mockRejectedValue(new Error('State not found'));

      const status = await service.getStatus('bad-task');
      expect(status).toBeNull();
    });

    it('should use taskId as thread_id', async () => {
      await service.getStatus('specific-task-id');

      expect(mockGraph.getState).toHaveBeenCalledWith({
        configurable: { thread_id: 'specific-task-id' },
      });
    });
  });

  describe('getHistory', () => {
    it('should return history when states exist', async () => {
      const history = await service.getHistory('task-service-123');

      expect(history).toBeDefined();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
    });

    it('should return empty array when getStateHistory throws', async () => {
      mockGraph.getStateHistory.mockReturnValue({
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.reject(new Error('History error')),
        }),
      });

      const history = await service.getHistory('bad-task');
      expect(history).toEqual([]);
    });

    it('should use taskId as thread_id for history', async () => {
      await service.getHistory('specific-history-task');

      expect(mockGraph.getStateHistory).toHaveBeenCalledWith({
        configurable: { thread_id: 'specific-history-task' },
      });
    });
  });
});
