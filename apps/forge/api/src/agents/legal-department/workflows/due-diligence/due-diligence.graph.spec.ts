import { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../shared/services/observability.service';
import { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';
import type { WorkflowRagService } from '../../../shared/services/workflow-rag.service';
import { createDueDiligenceGraph } from './due-diligence.graph';

// ── Mocks ───────────────────────────────────────────────────────────────

const mockLLMClient = {
  callLLM: jest.fn().mockResolvedValue({ text: '{}' }),
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

const mockWorkflowRag = {
  getContext: jest.fn().mockResolvedValue(''),
} as unknown as jest.Mocked<WorkflowRagService>;

// ── Tests ────────────────────────────────────────────────────────────────

describe('DueDiligenceGraph', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('compiles the graph without error', async () => {
    const graph = await createDueDiligenceGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );
    expect(graph).toBeDefined();
  });

  it('compiled graph exposes invoke()', async () => {
    const graph = await createDueDiligenceGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );
    expect(typeof graph.invoke).toBe('function');
  });

  it('creates the checkpointer via getSaver()', async () => {
    await createDueDiligenceGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );
    expect(mockCheckpointer.getSaver).toHaveBeenCalled();
  });

  it('compiles with optional WorkflowRagService', async () => {
    const graph = await createDueDiligenceGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
      mockWorkflowRag,
    );
    expect(graph).toBeDefined();
    expect(typeof graph.invoke).toBe('function');
  });

  it('compiles without WorkflowRagService', async () => {
    const graph = await createDueDiligenceGraph(
      mockLLMClient,
      mockObservability,
      mockCheckpointer,
    );
    expect(graph).toBeDefined();
  });
});
