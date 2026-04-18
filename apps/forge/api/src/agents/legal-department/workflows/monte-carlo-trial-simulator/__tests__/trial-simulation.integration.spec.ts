import { MemorySaver } from '@langchain/langgraph';
import { createTrialSimulationGraph } from '../trial-simulation.graph';
import { TEST_CASE_RECORD } from '../fixtures/test-case-record.fixture';
import { generateSimulationParameters } from '../generate-parameters.util';
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { PostgresCheckpointerService } from '../../../../shared/persistence/postgres-checkpointer.service';

const INTEGRATION_TIMEOUT = 600000;

const mockCtx = {
  orgSlug: 'test-org',
  userId: 'test-user',
  conversationId: `integration-sim-${Date.now()}`,
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

describe('trial-simulation integration (real Ollama)', () => {
  it(
    'runs a complete single simulation and returns a valid SimulationResult',
    async () => {
      const llmClient = {
        callLLM: jest
          .fn()
          .mockImplementation(
            async (params: {
              context: typeof mockCtx;
              systemMessage: string;
              userMessage: string;
              temperature?: number;
              maxTokens?: number;
              callerName?: string;
            }) => {
              const model = params.context.model ?? 'gemma4:e4b';
              const response = await fetch('http://localhost:11434/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model,
                  messages: [
                    { role: 'system', content: params.systemMessage },
                    { role: 'user', content: params.userMessage },
                  ],
                  stream: false,
                  options: { temperature: params.temperature ?? 0.7 },
                }),
              });
              const data = (await response.json()) as {
                message?: { content?: string };
                usage?: { prompt_tokens?: number; completion_tokens?: number };
              };
              return {
                text: data.message?.content ?? '',
                usage: {
                  promptTokens: data.usage?.prompt_tokens ?? 0,
                  completionTokens: data.usage?.completion_tokens ?? 0,
                },
              };
            },
          ),
      } as unknown as LLMHttpClientService;

      const observability = {
        emitProgress: jest.fn().mockResolvedValue(undefined),
        emitStarted: jest.fn().mockResolvedValue(undefined),
        emitCompleted: jest.fn().mockResolvedValue(undefined),
        emitFailed: jest.fn().mockResolvedValue(undefined),
      } as unknown as ObservabilityService;

      const memorySaver = new MemorySaver();
      const checkpointer = {
        getSaver: jest.fn().mockResolvedValue(memorySaver),
      } as unknown as PostgresCheckpointerService;

      const graph = await createTrialSimulationGraph(
        llmClient,
        observability,
        checkpointer,
      );

      const parameters = generateSimulationParameters(TEST_CASE_RECORD, 0, 1);
      const caseRecord = { ...TEST_CASE_RECORD, simulationCount: 1 };

      const rawResult = await graph.invoke(
        {
          executionContext: mockCtx,
          caseRecord,
          parameters,
          tokenUsage: { input: 0, output: 0 },
        },
        { configurable: { thread_id: mockCtx.conversationId } },
      );
      const result = rawResult as {
        status: string;
        simulationResult: import('../monte-carlo-trial-simulator.types').SimulationResult;
        error?: string;
      };

      expect(result.status).toBe('completed');
      expect(result.simulationResult).toBeDefined();
      expect(['plaintiff', 'defense', 'mixed']).toContain(
        result.simulationResult.verdict,
      );
      expect(result.simulationResult.claimResults).toHaveLength(
        TEST_CASE_RECORD.claims.length,
      );
      expect(result.simulationResult.simulationId).toBe(
        'matter-breach-2024-001-sim-0',
      );
      expect(result.simulationResult.durationMs).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    },
    INTEGRATION_TIMEOUT,
  );
});
