import { createJuryDeliberationNode } from '../nodes/jury-deliberation.node';
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
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

function buildState(
  overrides: Partial<TrialSimulationState> = {},
): TrialSimulationState {
  return {
    messages: [],
    executionContext: mockCtx,
    caseRecord: TEST_CASE_RECORD,
    parameters: generateSimulationParameters(TEST_CASE_RECORD, 0, 1),
    openingArguments: {
      plaintiff: 'Plaintiff opening.',
      defense: 'Defense opening.',
    },
    evidencePhaseResults: [
      {
        evidenceId: 'ev-1',
        description: 'Signed contract',
        admitted: true,
        objection: 'No objection',
        ruling: 'Admitted',
        juryImpact: 'Strong evidence for plaintiff.',
      },
    ],
    closingArguments: {
      plaintiff: 'Plaintiff closing.',
      defense: 'Defense closing.',
    },
    deliberationOutput: undefined,
    simulationResult: undefined,
    status: 'processing',
    error: undefined,
    startedAt: Date.now(),
    tokenUsage: { input: 500, output: 600 },
    ...overrides,
  } as TrialSimulationState;
}

const validVerdictResponse = JSON.stringify({
  verdict: 'plaintiff',
  claimResults: [
    { claimId: 'claim-1', liable: true },
    { claimId: 'claim-2', liable: true },
    { claimId: 'claim-3', liable: false },
  ],
  damagesAwarded: 3500000,
  keyFactors: [
    'The signed contract clearly defined deliverables',
    'Expert testimony was credible',
  ],
  pivotalMoments: ['Admission of the email chain showing known bugs'],
  deliberationNarrative:
    'Jury deliberated for 3 hours before reaching verdict.',
});

describe('juryDeliberationNode', () => {
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;

  beforeEach(() => {
    mockLLMClient = {
      callLLM: jest.fn().mockResolvedValue({
        text: validVerdictResponse,
        usage: { promptTokens: 400, completionTokens: 300 },
      }),
    } as unknown as jest.Mocked<LLMHttpClientService>;

    mockObservability = {
      emitProgress: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ObservabilityService>;
  });

  it('returns deliberationOutput as JSON string on valid response', async () => {
    const node = createJuryDeliberationNode(mockLLMClient, mockObservability);
    const result = await node(buildState());

    expect(result.deliberationOutput).toBeDefined();
    const parsed = JSON.parse(result.deliberationOutput!);
    expect(parsed.verdict).toBe('plaintiff');
    expect(parsed.claimResults).toHaveLength(3);
    expect(parsed.damagesAwarded).toBe(3500000);
    expect(result.error).toBeUndefined();
  });

  it('returns error and failed status on JSON parse failure', async () => {
    mockLLMClient.callLLM = jest.fn().mockResolvedValue({
      text: 'The jury finds in favor of... wait this is not JSON',
      usage: { promptTokens: 100, completionTokens: 30 },
    });

    const node = createJuryDeliberationNode(mockLLMClient, mockObservability);
    const result = await node(buildState());

    expect(result.error).toContain('JSON parse failure in jury-deliberation');
    expect(result.status).toBe('failed');
    expect(result.deliberationOutput).toBeUndefined();
  });

  it('uses gemma4:26b model override in LLM call', async () => {
    const node = createJuryDeliberationNode(mockLLMClient, mockObservability);
    await node(buildState());

    const callArgs = (mockLLMClient.callLLM as jest.Mock).mock.calls[0][0] as {
      context: { model: string };
    };
    expect(callArgs.context.model).toBe('gemma4:26b');
  });

  it('emits progress at step jury_deliberation', async () => {
    const node = createJuryDeliberationNode(mockLLMClient, mockObservability);
    await node(buildState());

    expect(mockObservability.emitProgress).toHaveBeenCalledWith(
      expect.anything(),
      'conv-123',
      expect.stringContaining('jury deliberating'),
      expect.objectContaining({ step: 'jury_deliberation' }),
    );
  });

  it('accumulates token usage from prior state', async () => {
    const node = createJuryDeliberationNode(mockLLMClient, mockObservability);
    const result = await node(buildState());

    expect(result.tokenUsage?.input).toBe(500 + 400);
    expect(result.tokenUsage?.output).toBe(600 + 300);
  });
});
