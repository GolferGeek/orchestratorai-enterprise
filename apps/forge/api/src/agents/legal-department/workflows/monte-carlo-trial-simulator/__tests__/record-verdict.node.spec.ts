import { createRecordVerdictNode } from '../nodes/record-verdict.node';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { TrialSimulationState } from '../trial-simulation.state';
import { TEST_CASE_RECORD } from '../fixtures/test-case-record.fixture';
import { generateSimulationParameters } from '../generate-parameters.util';

const mockCtx = {
  orgSlug: 'test-org',
  userId: 'test-user',
  conversationId: 'conv-123',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

const deliberationOutput = JSON.stringify({
  verdict: 'plaintiff',
  claimResults: [
    { claimId: 'claim-1', liable: true },
    { claimId: 'claim-2', liable: false },
    { claimId: 'claim-3', liable: false },
  ],
  damagesAwarded: 2500000,
  keyFactors: ['Strong documentary evidence', 'Expert testimony credible'],
  pivotalMoments: ['Email chain admission'],
  deliberationNarrative: 'Jury deliberated 2 hours.',
});

function buildState(
  overrides: Partial<TrialSimulationState> = {},
): TrialSimulationState {
  return {
    messages: [],
    executionContext: mockCtx,
    caseRecord: TEST_CASE_RECORD,
    parameters: generateSimulationParameters(TEST_CASE_RECORD, 0, 1),
    openingArguments: { plaintiff: 'P opening', defense: 'D opening' },
    evidencePhaseResults: [
      {
        evidenceId: 'ev-1',
        description: 'Signed contract',
        admitted: true,
        objection: 'No objection',
        ruling: 'Admitted',
        juryImpact: 'Strong for plaintiff',
      },
    ],
    closingArguments: { plaintiff: 'P closing', defense: 'D closing' },
    deliberationOutput,
    simulationResult: undefined,
    status: 'processing',
    error: undefined,
    startedAt: Date.now() - 5000,
    tokenUsage: { input: 800, output: 700 },
    ...overrides,
  } as TrialSimulationState;
}

describe('recordVerdictNode', () => {
  let mockObservability: jest.Mocked<ObservabilityService>;

  beforeEach(() => {
    mockObservability = {
      emitProgress: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ObservabilityService>;
  });

  it('packages full SimulationResult from state', async () => {
    const node = createRecordVerdictNode(mockObservability);
    const result = await node(buildState());

    expect(result.simulationResult).toBeDefined();
    expect(result.simulationResult?.verdict).toBe('plaintiff');
    expect(result.simulationResult?.claimResults).toHaveLength(3);
    expect(result.simulationResult?.damagesAwarded).toBe(2500000);
    expect(result.simulationResult?.keyFactors).toHaveLength(2);
    expect(result.simulationResult?.simulationId).toBe(
      'matter-breach-2024-001-sim-0',
    );
    expect(result.status).toBe('completed');
  });

  it('builds complete SimulationTranscript', async () => {
    const node = createRecordVerdictNode(mockObservability);
    const result = await node(buildState());

    const transcript = result.simulationResult?.transcript;
    expect(transcript?.openingArguments.plaintiff).toBe('P opening');
    expect(transcript?.closingArguments.defense).toBe('D closing');
    expect(transcript?.evidencePhase).toHaveLength(1);
    expect(transcript?.verdict).toBe('plaintiff');
    expect(transcript?.juryDeliberation).toContain('deliberated 2 hours');
  });

  it('records durationMs from startedAt', async () => {
    const node = createRecordVerdictNode(mockObservability);
    const result = await node(buildState());

    expect(result.simulationResult?.durationMs).toBeGreaterThanOrEqual(4000);
  });

  it('defaults to defense verdict when deliberationOutput is undefined', async () => {
    const node = createRecordVerdictNode(mockObservability);
    const result = await node(buildState({ deliberationOutput: undefined }));

    expect(result.simulationResult?.verdict).toBe('defense');
    expect(result.simulationResult?.claimResults.every((r) => !r.liable)).toBe(
      true,
    );
  });

  it('emits progress with record_verdict step', async () => {
    const node = createRecordVerdictNode(mockObservability);
    await node(buildState());

    expect(mockObservability.emitProgress).toHaveBeenCalledWith(
      mockCtx,
      'conv-123',
      expect.stringContaining('recorded'),
      expect.objectContaining({ step: 'record_verdict', progress: 98 }),
    );
  });
});
