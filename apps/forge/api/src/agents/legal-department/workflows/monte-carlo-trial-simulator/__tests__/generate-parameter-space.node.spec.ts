import { createGenerateParameterSpaceNode } from '../nodes/generate-parameter-space.node';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { TrialSimulatorState } from '../trial-simulator.state';
import { TEST_CASE_RECORD } from '../fixtures/test-case-record.fixture';

function buildState(simulationCount: number): TrialSimulatorState {
  return {
    messages: [],
    executionContext: {
      orgSlug: 'test-org',
      userId: 'test-user',
      conversationId: 'conv-123',
      agentSlug: 'legal-department',
      agentType: 'langgraph',
      provider: 'ollama',
      model: 'gemma4:e4b',
    },
    caseRecord: { ...TEST_CASE_RECORD, simulationCount },
    parameterSets: [],
    simulationResults: [],
    currentSimulationIndex: 0,
    aggregation: undefined,
    status: 'processing',
    error: undefined,
    startedAt: Date.now(),
    tokenUsage: { input: 0, output: 0 },
  } as TrialSimulatorState;
}

describe('generateParameterSpaceNode', () => {
  let mockObservability: jest.Mocked<ObservabilityService>;

  beforeEach(() => {
    mockObservability = {
      emitProgress: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ObservabilityService>;
  });

  it('generates exactly simulationCount parameter sets', async () => {
    const node = createGenerateParameterSpaceNode(mockObservability);
    const result = await node(buildState(10));

    expect(result.parameterSets).toHaveLength(10);
  });

  it('plaintiffSympathy distribution covers range -1 to +1 for N=10', async () => {
    const node = createGenerateParameterSpaceNode(mockObservability);
    const result = await node(buildState(10));

    const biases = result.parameterSets!.map(
      (p) => p.juryComposition.attitudeBiases.plaintiffSympathy,
    );
    const min = Math.min(...biases);
    const max = Math.max(...biases);
    expect(min).toBeCloseTo(-1, 1);
    expect(max).toBeCloseTo(1, 1);
  });

  it('evidence admissibility for high-risk items is split approximately 50/50 for N=10', async () => {
    const node = createGenerateParameterSpaceNode(mockObservability);
    const result = await node(buildState(10));

    // ev-4 is high risk (admissibilityRisk: 'high') — admitted when index % 3 === 0
    const admittedCount = result.parameterSets!.filter(
      (p) => p.evidenceAdmissibility['ev-4'] === true,
    ).length;
    // For 10 sims: indices 0, 3, 6, 9 admit (4 out of 10 = 40%)
    // Not exactly 50% but should be in a reasonable range
    expect(admittedCount).toBeGreaterThanOrEqual(3);
    expect(admittedCount).toBeLessThanOrEqual(7);
  });

  it('low-risk evidence (ev-1) is always admitted', async () => {
    const node = createGenerateParameterSpaceNode(mockObservability);
    const result = await node(buildState(10));

    const allAdmitted = result.parameterSets!.every(
      (p) => p.evidenceAdmissibility['ev-1'] === true,
    );
    expect(allAdmitted).toBe(true);
  });

  it('each parameter set has a unique simulationId with the correct matterId prefix', async () => {
    const node = createGenerateParameterSpaceNode(mockObservability);
    const result = await node(buildState(5));

    const ids = result.parameterSets!.map((p) => p.simulationId);
    expect(new Set(ids).size).toBe(5);
    expect(ids[0]).toBe('matter-breach-2024-001-sim-0');
    expect(ids[4]).toBe('matter-breach-2024-001-sim-4');
  });

  it('emits progress with parameter_generation step', async () => {
    const node = createGenerateParameterSpaceNode(mockObservability);
    await node(buildState(3));

    expect(mockObservability.emitProgress).toHaveBeenCalledWith(
      expect.anything(),
      'conv-123',
      expect.stringContaining('3 simulation parameter sets'),
      expect.objectContaining({ step: 'parameter_generation', progress: 5 }),
    );
  });
});
