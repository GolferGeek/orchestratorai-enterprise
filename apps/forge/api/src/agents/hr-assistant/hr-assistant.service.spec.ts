/**
 * Unit tests for HrAssistantService
 *
 * Tests:
 * - onModuleInit() initializes the graph with all dependencies
 * - execute() uses conversationId as thread_id
 * - execute() returns completed result on successful graph run
 * - execute() returns failed status when graph state is not completed
 * - execute() includes sources and result from final state
 */

import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { HrAssistantService } from './hr-assistant.service';
import { HrAssistantInput, HrAssistantState, HrSource } from './hr-assistant.state';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { RagHttpClientService } from '../shared/services/rag-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';

// Mock graph factory — avoids initializing LangGraph + RAG connections
jest.mock('./hr-assistant.graph', () => ({
  createHrAssistantGraph: jest.fn(),
}));

import { createHrAssistantGraph } from './hr-assistant.graph';

describe('HrAssistantService', () => {
  let service: HrAssistantService;
  let mockLlmClient: jest.Mocked<Pick<LLMHttpClientService, 'callLLM'>>;
  let mockRagClient: jest.Mocked<RagHttpClientService>;
  let mockObservability: jest.Mocked<Pick<ObservabilityService, 'emitStarted' | 'emitCompleted' | 'emitFailed'>>;
  let mockCheckpointer: jest.Mocked<Pick<PostgresCheckpointerService, 'getSaver'>>;
  let mockGraph: { invoke: jest.Mock };

  const mockContext = createMockExecutionContext({
    orgSlug: 'hr-org',
    conversationId: 'hr-conv-456',
    agentSlug: 'hr-assistant',
  });

  const completedState: Partial<HrAssistantState> = {
    executionContext: mockContext,
    userMessage: 'What is the PTO policy?',
    status: 'completed',
    result: 'Employees are entitled to 15 days of PTO per year.',
    sources: [{ score: 0.95, excerpt: 'Employees are entitled to...', section: 'PTO Policy', documentId: 'employee-handbook-v3' }] as HrSource[],
    error: undefined,
  };

  beforeEach(() => {
    mockGraph = {
      invoke: jest.fn().mockResolvedValue(completedState),
    };

    (createHrAssistantGraph as jest.Mock).mockResolvedValue(mockGraph);

    mockLlmClient = { callLLM: jest.fn() } as unknown as jest.Mocked<Pick<LLMHttpClientService, 'callLLM'>>;
    mockRagClient = { query: jest.fn() } as unknown as jest.Mocked<RagHttpClientService>;
    mockObservability = {
      emitStarted: jest.fn().mockResolvedValue(undefined),
      emitCompleted: jest.fn().mockResolvedValue(undefined),
      emitFailed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Pick<ObservabilityService, 'emitStarted' | 'emitCompleted' | 'emitFailed'>>;
    mockCheckpointer = {
      getSaver: jest.fn(),
    } as unknown as jest.Mocked<Pick<PostgresCheckpointerService, 'getSaver'>>;

    service = new HrAssistantService(
      mockLlmClient as unknown as LLMHttpClientService,
      mockRagClient,
      mockObservability as unknown as ObservabilityService,
      mockCheckpointer as unknown as PostgresCheckpointerService,
    );
  });

  // ─── onModuleInit ────────────────────────────────────────────────────────

  it('initializes the graph with all four dependencies', async () => {
    await service.onModuleInit();

    expect(createHrAssistantGraph).toHaveBeenCalledWith(
      mockLlmClient,
      mockRagClient,
      mockObservability,
      mockCheckpointer,
    );
  });

  // ─── execute() ──────────────────────────────────────────────────────────

  describe('execute()', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('uses conversationId as graph thread_id', async () => {
      const input: HrAssistantInput = {
        context: mockContext,
        userMessage: 'What is the PTO policy?',
      };

      await service.execute(input);

      const [, config] = mockGraph.invoke.mock.calls[0]!;
      expect(config.configurable.thread_id).toBe('hr-conv-456');
    });

    it('returns completed result with result text and sources', async () => {
      const input: HrAssistantInput = {
        context: mockContext,
        userMessage: 'What is the PTO policy?',
      };

      const result = await service.execute(input);

      expect(result.status).toBe('completed');
      expect(result.taskId).toBe('hr-conv-456');
      expect(result.result).toBe('Employees are entitled to 15 days of PTO per year.');
      expect(result.sources).toBeDefined();
      expect(result.sources!.length).toBe(1);
      expect(result.sources![0]!.documentId).toBe('employee-handbook-v3');
    });

    it('passes ExecutionContext whole to graph initial state', async () => {
      const input: HrAssistantInput = {
        context: mockContext,
        userMessage: 'Can I work remotely?',
      };

      await service.execute(input);

      const [initialState] = mockGraph.invoke.mock.calls[0]!;
      expect(initialState.executionContext).toBe(mockContext);
    });

    it('returns failed status when final state is not completed', async () => {
      mockGraph.invoke.mockResolvedValue({
        ...completedState,
        status: 'error',
        error: 'RAG service unavailable',
      });

      const result = await service.execute({
        context: mockContext,
        userMessage: 'Benefits question',
      });

      expect(result.status).toBe('failed');
    });

    it('includes error from final state in result', async () => {
      mockGraph.invoke.mockResolvedValue({
        ...completedState,
        status: 'error',
        error: 'RAG service unavailable',
        result: undefined,
      });

      const result = await service.execute({
        context: mockContext,
        userMessage: 'Benefits question',
      });

      expect(result.error).toBe('RAG service unavailable');
    });
  });
});
