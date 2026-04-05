/**
 * Unit tests for CustomerServiceService
 *
 * Tests:
 * - process() uses conversationId as thread_id
 * - process() applies history windowing (> 20 messages are truncated)
 * - process() always preserves the first user message when windowing
 * - process() returns failed status when graph.invoke resolves with non-completed status
 * - getStatus() returns null when graph state has no values
 */

import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { CustomerServiceService } from './customer-service.service';
import {
  CustomerServiceInput,
  CustomerServiceState,
} from './customer-service.state';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';

// Mock graph factory to avoid compiling full LangGraph
jest.mock('./customer-service.graph', () => ({
  createCustomerServiceGraph: jest.fn(),
}));

import { createCustomerServiceGraph } from './customer-service.graph';

describe('CustomerServiceService', () => {
  let service: CustomerServiceService;
  let mockLlmClient: jest.Mocked<Pick<LLMHttpClientService, 'callLLM'>>;
  let mockObservability: jest.Mocked<
    Pick<ObservabilityService, 'emitStarted' | 'emitCompleted' | 'emitFailed'>
  >;
  let mockCheckpointer: jest.Mocked<
    Pick<PostgresCheckpointerService, 'getSaver'>
  >;
  let mockGraph: { invoke: jest.Mock; getState: jest.Mock };

  const mockContext = createMockExecutionContext({
    orgSlug: 'acme',
    conversationId: 'conv-abc-123',
    agentSlug: 'customer-service',
  });

  const completedState: CustomerServiceState = {
    executionContext: mockContext,
    userMessage: 'How do I reset my password?',
    conversationHistory: [],
    interactionMode: 'text',
    status: 'completed',
    intent: 'account_support',
    response: 'You can reset your password at /settings/security.',
    error: undefined,
    startedAt: Date.now() - 500,
  } as unknown as CustomerServiceState;

  beforeEach(() => {
    mockGraph = {
      invoke: jest.fn().mockResolvedValue(completedState),
      getState: jest.fn(),
    };

    (createCustomerServiceGraph as jest.Mock).mockResolvedValue(mockGraph);

    mockLlmClient = { callLLM: jest.fn() } as unknown as jest.Mocked<
      Pick<LLMHttpClientService, 'callLLM'>
    >;
    mockObservability = {
      emitStarted: jest.fn().mockResolvedValue(undefined),
      emitCompleted: jest.fn().mockResolvedValue(undefined),
      emitFailed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<
      Pick<ObservabilityService, 'emitStarted' | 'emitCompleted' | 'emitFailed'>
    >;
    mockCheckpointer = {
      getSaver: jest.fn(),
    } as unknown as jest.Mocked<Pick<PostgresCheckpointerService, 'getSaver'>>;

    service = new CustomerServiceService(
      mockLlmClient as unknown as LLMHttpClientService,
      mockObservability as unknown as ObservabilityService,
      mockCheckpointer as unknown as PostgresCheckpointerService,
    );
  });

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  it('onModuleInit initializes the graph', async () => {
    await service.onModuleInit();

    expect(createCustomerServiceGraph).toHaveBeenCalledWith(
      mockLlmClient,
      mockObservability,
      mockCheckpointer,
    );
  });

  // ─── process() ─────────────────────────────────────────────────────────

  describe('process()', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('uses conversationId as graph thread_id', async () => {
      const input: CustomerServiceInput = {
        context: mockContext,
        userMessage: 'How do I reset my password?',
      };

      await service.process(input);

      const [, config] = mockGraph.invoke.mock.calls[0]!;
      expect(config.configurable.thread_id).toBe('conv-abc-123');
    });

    it('returns completed result with response and intent', async () => {
      const input: CustomerServiceInput = {
        context: mockContext,
        userMessage: 'How do I reset my password?',
      };

      const result = await service.process(input);

      expect(result.status).toBe('completed');
      expect(result.conversationId).toBe('conv-abc-123');
      expect(result.response).toBe(
        'You can reset your password at /settings/security.',
      );
      expect(result.intent).toBe('account_support');
    });

    it('returns failed status when graph state is not completed', async () => {
      mockGraph.invoke.mockResolvedValue({
        ...completedState,
        status: 'error',
        error: 'LLM call failed',
      });

      const result = await service.process({
        context: mockContext,
        userMessage: 'What is your return policy?',
      });

      expect(result.status).toBe('failed');
    });

    it('applies history window — truncates messages beyond 20', async () => {
      const manyMessages = Array.from({ length: 25 }, (_, i) => ({
        role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
        content: `Message ${i}`,
      }));

      const input: CustomerServiceInput = {
        context: mockContext,
        userMessage: 'Latest question',
        messages: manyMessages,
      };

      await service.process(input);

      const [initialState] = mockGraph.invoke.mock.calls[0]!;
      expect(initialState.conversationHistory.length).toBeLessThanOrEqual(20);
    });

    it('preserves first user message when applying history window', async () => {
      const firstUserMessage = {
        role: 'user' as const,
        content: 'Initial question from user',
      };
      const manyMessages = [
        firstUserMessage,
        ...Array.from({ length: 24 }, (_, i) => ({
          role: i % 2 === 0 ? ('assistant' as const) : ('user' as const),
          content: `Follow-up ${i}`,
        })),
      ];

      await service.process({
        context: mockContext,
        userMessage: 'Yet another question',
        messages: manyMessages,
      });

      const [initialState] = mockGraph.invoke.mock.calls[0]!;
      const history: Array<{ role: string; content: string }> =
        initialState.conversationHistory;
      const hasFirstMessage = history.some(
        (m) => m.content === 'Initial question from user',
      );
      expect(hasFirstMessage).toBe(true);
    });
  });

  // ─── getStatus() ────────────────────────────────────────────────────────

  describe('getStatus()', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('returns status for a known conversation', async () => {
      mockGraph.getState.mockResolvedValue({
        values: completedState,
      });

      const status = await service.getStatus('conv-abc-123');

      expect(status).not.toBeNull();
      expect(status?.conversationId).toBe('conv-abc-123');
      expect(status?.status).toBe('completed');
    });

    it('returns null when graph state has no values', async () => {
      mockGraph.getState.mockResolvedValue({ values: null });

      const status = await service.getStatus('conv-abc-123');

      expect(status).toBeNull();
    });

    it('returns null on graph error', async () => {
      mockGraph.getState.mockRejectedValue(new Error('thread not found'));

      const status = await service.getStatus('unknown-conv');

      expect(status).toBeNull();
    });
  });
});
