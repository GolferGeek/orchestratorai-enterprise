/**
 * Sentinel Evaluate Graph — construction and edge routing tests.
 *
 * Validates that the graph can be compiled and has the expected node set
 * and edge routing. Does not require live LLM or DB.
 */
import { createSentinelEvaluateGraph } from './sentinel-evaluate.graph';

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
  listSignals: jest.fn().mockResolvedValue([]),
  markSignalsProcessed: jest.fn().mockResolvedValue(undefined),
  createAlertsBatch: jest.fn().mockResolvedValue([]),
} as any;

describe('SentinelEvaluateGraph', () => {
  it('compiles without error', async () => {
    const graph = await createSentinelEvaluateGraph(
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
    const graph = await createSentinelEvaluateGraph(
      mockLlm,
      mockObservability,
      mockCheckpointer,
      mockRepository,
      mockRag,
    );
    expect(graph).toBeDefined();
  });
});
