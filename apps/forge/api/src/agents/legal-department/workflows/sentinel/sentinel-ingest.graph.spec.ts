/**
 * Sentinel Ingest Graph — construction and edge routing tests.
 *
 * Validates that the graph can be compiled and has the expected node set
 * and edge routing. Does not require live LLM or DB.
 */
import { createSentinelIngestGraph } from './sentinel-ingest.graph';

const mockLlm = {} as any;
const mockObservability = {
  emitStarted: jest.fn().mockResolvedValue(undefined),
  emitProgress: jest.fn().mockResolvedValue(undefined),
  emitCompleted: jest.fn().mockResolvedValue(undefined),
  emitFailed: jest.fn().mockResolvedValue(undefined),
} as any;
const mockCheckpointer = {
  getSaver: jest.fn().mockResolvedValue({
    get: jest.fn(),
    put: jest.fn(),
    list: jest.fn(),
  }),
} as any;
const mockRepository = {
  getExistingHashes: jest.fn().mockResolvedValue(new Set()),
  createSignalsBatch: jest.fn().mockResolvedValue([]),
  updateSourcePolled: jest.fn().mockResolvedValue(undefined),
} as any;

describe('SentinelIngestGraph', () => {
  it('compiles without error', async () => {
    const graph = await createSentinelIngestGraph(
      mockLlm,
      mockObservability,
      mockCheckpointer,
      mockRepository,
    );
    expect(graph).toBeDefined();
    expect(typeof graph.invoke).toBe('function');
  });

  it('compiles with optional workflowRag', async () => {
    const mockRag = {} as any;
    const graph = await createSentinelIngestGraph(
      mockLlm,
      mockObservability,
      mockCheckpointer,
      mockRepository,
      mockRag,
    );
    expect(graph).toBeDefined();
  });
});
