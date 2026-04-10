import { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../shared/services/observability.service';
import { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';
import { createContractReviewGraph } from './contract-review.graph';

const mockLLMClient = {
  callLLM: jest.fn().mockResolvedValue({ text: '[]' }),
} as unknown as jest.Mocked<LLMHttpClientService>;

const mockObservability = {
  emitStarted: jest.fn().mockResolvedValue(undefined),
  emitProgress: jest.fn().mockResolvedValue(undefined),
  emitCompleted: jest.fn().mockResolvedValue(undefined),
  emitFailed: jest.fn().mockResolvedValue(undefined),
} as unknown as jest.Mocked<ObservabilityService>;

const mockCheckpointer = {
  getSaver: jest.fn().mockResolvedValue(undefined),
} as unknown as jest.Mocked<PostgresCheckpointerService>;

describe('ContractReviewGraph', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('compiles the graph without error', async () => {
    const graph = await createContractReviewGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );

    expect(graph).toBeDefined();
  });

  it('compiled graph is a valid CompiledStateGraph', async () => {
    const graph = await createContractReviewGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );

    // CompiledStateGraph (Pregel) exposes an invoke method
    expect(typeof graph.invoke).toBe('function');
  });

  it('creates the checkpointer via getSaver()', async () => {
    await createContractReviewGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );

    expect(mockCheckpointer.getSaver).toHaveBeenCalled();
  });
});
