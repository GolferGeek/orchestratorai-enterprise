import { MemorySaver } from '@langchain/langgraph';
import { createTrialSimulatorGraph } from '../trial-simulator.graph';
import { createTrialSimulationGraph } from '../trial-simulation.graph';
import { TEST_CASE_RECORD } from '../fixtures/test-case-record.fixture';
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { PostgresCheckpointerService } from '../../../../shared/persistence/postgres-checkpointer.service';
import type { MonteCarloTrialSimulatorResult } from '../monte-carlo-trial-simulator.types';

const INTEGRATION_TIMEOUT = 1800000;

const mockCtx = {
  orgSlug: 'test-org',
  userId: 'test-user',
  conversationId: `integration-outer-${Date.now()}`,
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

async function buildLLMClient(): Promise<LLMHttpClientService> {
  return {
    callLLM: jest
      .fn()
      .mockImplementation(
        async (params: {
          context: { model?: string };
          systemMessage: string;
          userMessage: string;
          temperature?: number;
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
}

describe('trial-simulator integration — 5 simulations (real Ollama)', () => {
  it(
    'runs 5 simulations and produces valid aggregated result',
    async () => {
      const llmClient = await buildLLMClient();

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

      const innerGraph = await createTrialSimulationGraph(
        llmClient,
        observability,
        checkpointer,
      );

      const outerGraph = await createTrialSimulatorGraph(
        llmClient,
        observability,
        checkpointer,
        innerGraph,
      );

      const caseRecord = { ...TEST_CASE_RECORD, simulationCount: 5 };

      const rawResult = await outerGraph.invoke(
        {
          executionContext: mockCtx,
          caseRecord,
          tokenUsage: { input: 0, output: 0 },
        },
        { configurable: { thread_id: mockCtx.conversationId } },
      );
      const result = rawResult as {
        status: string;
        aggregation: MonteCarloTrialSimulatorResult;
        error?: string;
      };

      expect(result.status).toBe('completed');
      expect(result.aggregation).toBeDefined();

      const agg = result.aggregation;
      expect(agg.simulationsRequested).toBe(5);
      expect(agg.simulationsCompleted + agg.simulationsFailed).toBe(5);

      // Outcome rates should sum to ~1.0
      const rateSum =
        agg.outcomeDistribution.plaintiffWinRate +
        agg.outcomeDistribution.defenseWinRate +
        agg.outcomeDistribution.mixedRate;
      expect(rateSum).toBeCloseTo(1.0, 1);

      // Settlement range: low <= high
      if (agg.settlementRange.high > 0) {
        expect(agg.settlementRange.low).toBeLessThanOrEqual(
          agg.settlementRange.high,
        );
      }

      // Sensitivity analysis has entries
      expect(agg.sensitivityAnalysis.length).toBeGreaterThanOrEqual(1);

      // Disclaimer text is present
      expect(agg.disclaimerText).toContain(
        'Trial simulation is an analytical tool',
      );

      // Duration was set
      expect(agg.durationMs).toBeGreaterThan(0);

      expect(result.error).toBeUndefined();
    },
    INTEGRATION_TIMEOUT,
  );
});
