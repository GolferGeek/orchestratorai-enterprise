import { createAggregateResultsNode } from '../nodes/aggregate-results.node';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { TrialSimulatorState } from '../trial-simulator.state';
import { TEST_CASE_RECORD } from '../fixtures/test-case-record.fixture';
import { generateSimulationParameters } from '../generate-parameters.util';
import type { SimulationResult } from '../monte-carlo-trial-simulator.types';

function makeResult(
  index: number,
  verdict: 'plaintiff' | 'defense' | 'mixed',
  damagesAwarded?: number,
  error?: string,
): SimulationResult {
  const parameters = generateSimulationParameters(TEST_CASE_RECORD, index, 10);
  return {
    simulationId: `matter-test-sim-${index}`,
    simulationIndex: index,
    parameters,
    verdict,
    claimResults: TEST_CASE_RECORD.claims.map((c) => ({
      claimId: c.claimId,
      liable: verdict === 'plaintiff',
    })),
    damagesAwarded,
    keyFactors: [],
    pivotalMoments: [],
    transcript: {
      parameters,
      openingArguments: { plaintiff: '', defense: '' },
      evidencePhase: [],
      closingArguments: { plaintiff: '', defense: '' },
      juryDeliberation: '',
      verdict,
    },
    durationMs: 1000,
    error,
  };
}

function buildState(results: SimulationResult[]): TrialSimulatorState {
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
    caseRecord: TEST_CASE_RECORD,
    parameterSets: [],
    simulationResults: results,
    currentSimulationIndex: 0,
    aggregation: undefined,
    status: 'processing',
    error: undefined,
    startedAt: Date.now() - 5000,
    tokenUsage: { input: 0, output: 0 },
  } as TrialSimulatorState;
}

describe('aggregateResultsNode', () => {
  let mockObservability: jest.Mocked<ObservabilityService>;

  beforeEach(() => {
    mockObservability = {
      emitProgress: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ObservabilityService>;
  });

  it('computes correct outcome distribution for 6 plaintiff, 3 defense, 1 mixed', async () => {
    const results = [
      ...Array.from({ length: 6 }, (_, i) =>
        makeResult(i, 'plaintiff', 2000000),
      ),
      ...Array.from({ length: 3 }, (_, i) => makeResult(6 + i, 'defense')),
      makeResult(9, 'mixed', 500000),
    ];

    const node = createAggregateResultsNode(mockObservability);
    const result = await node(buildState(results));

    expect(result.aggregation?.outcomeDistribution.plaintiffWins).toBe(6);
    expect(result.aggregation?.outcomeDistribution.defenseWins).toBe(3);
    expect(result.aggregation?.outcomeDistribution.mixedVerdict).toBe(1);
    expect(result.aggregation?.outcomeDistribution.plaintiffWinRate).toBe(0.6);
    expect(result.aggregation?.outcomeDistribution.defenseWinRate).toBe(0.3);
    expect(result.aggregation?.outcomeDistribution.mixedRate).toBe(0.1);
  });

  it('computes damages distribution correctly for known values', async () => {
    const damages = [1000000, 2000000, 3000000, 4000000, 5000000, 6000000];
    const results = damages.map((d, i) => makeResult(i, 'plaintiff', d));

    const node = createAggregateResultsNode(mockObservability);
    const result = await node(buildState(results));

    const dist = result.aggregation?.damagesDistribution;
    expect(dist?.sampleSize).toBe(6);
    expect(dist?.mean).toBe(
      Math.round(
        (1000000 + 2000000 + 3000000 + 4000000 + 5000000 + 6000000) / 6,
      ),
    );
    expect(dist?.p25).toBeGreaterThan(0);
    expect(dist?.p75).toBeGreaterThanOrEqual(dist?.p25 ?? 0);
    expect(dist?.p90).toBeGreaterThanOrEqual(dist?.p75 ?? 0);
    expect(dist?.histogram).toHaveLength(10);
  });

  it('computes sensitivity for evidence admissibility', async () => {
    // ev-4 is high risk: in generateSimulationParameters, index%3===0 admits it
    // indices 0,3,6,9 admit ev-4 (4 of 10); indices 1,2,4,5,7,8 exclude ev-4 (6 of 10)
    // Make all ev-4-admitted sims plaintiff wins, all ev-4-excluded sims defense wins
    const results = Array.from({ length: 10 }, (_, i) => {
      const params = generateSimulationParameters(TEST_CASE_RECORD, i, 10);
      const admitsEv4 = params.evidenceAdmissibility['ev-4'] === true;
      return makeResult(
        i,
        admitsEv4 ? 'plaintiff' : 'defense',
        admitsEv4 ? 3000000 : undefined,
      );
    });

    const node = createAggregateResultsNode(mockObservability);
    const result = await node(buildState(results));

    const ev4Factor = result.aggregation?.sensitivityAnalysis.find(
      (f) => f.factorId === 'ev-4',
    );
    expect(ev4Factor).toBeDefined();
    expect(ev4Factor?.deltaRate).not.toBe(0);
  });

  it('handles zero-success edge case without crashing', async () => {
    const results = Array.from({ length: 5 }, (_, i) =>
      makeResult(i, 'defense', undefined, 'Simulation failed'),
    );

    const node = createAggregateResultsNode(mockObservability);
    const result = await node(buildState(results));

    expect(result.aggregation?.outcomeDistribution.plaintiffWins).toBe(0);
    expect(result.aggregation?.simulationsCompleted).toBe(0);
    expect(result.aggregation?.simulationsFailed).toBe(5);
    expect(result.aggregation?.expectedValue).toBe(0);
  });

  it('sets settlementRange to p25/p75', async () => {
    const damages = [
      1000000, 2000000, 3000000, 4000000, 5000000, 6000000, 7000000, 8000000,
    ];
    const results = damages.map((d, i) => makeResult(i, 'plaintiff', d));

    const node = createAggregateResultsNode(mockObservability);
    const result = await node(buildState(results));

    expect(result.aggregation?.settlementRange.low).toBe(
      result.aggregation?.damagesDistribution.p25,
    );
    expect(result.aggregation?.settlementRange.high).toBe(
      result.aggregation?.damagesDistribution.p75,
    );
  });

  it('includes all simulations (including failed) in simulations array', async () => {
    const results = [
      makeResult(0, 'plaintiff', 2000000),
      makeResult(1, 'defense', undefined, 'LLM timeout'),
      makeResult(2, 'plaintiff', 3000000),
    ];

    const node = createAggregateResultsNode(mockObservability);
    const result = await node(buildState(results));

    expect(result.aggregation?.simulations).toHaveLength(3);
    expect(result.aggregation?.simulationsCompleted).toBe(2);
    expect(result.aggregation?.simulationsFailed).toBe(1);
  });
});
