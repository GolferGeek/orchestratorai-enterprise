import { createClosingArgumentsNode } from '../nodes/closing-arguments.node';
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
      plaintiff: 'Plaintiff opening statement.',
      defense: 'Defense opening statement.',
    },
    evidencePhaseResults: [
      {
        evidenceId: 'ev-1',
        description: 'Signed contract',
        admitted: true,
        objection: 'No objection',
        ruling: 'Admitted',
        juryImpact: 'Jury notes the agreement clearly defines deliverables.',
      },
    ],
    closingArguments: undefined,
    deliberationOutput: undefined,
    simulationResult: undefined,
    status: 'processing',
    error: undefined,
    startedAt: Date.now(),
    tokenUsage: { input: 200, output: 300 },
    ...overrides,
  } as TrialSimulationState;
}

describe('closingArgumentsNode', () => {
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;

  beforeEach(() => {
    mockLLMClient = {
      callLLM: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          plaintiff: 'The evidence clearly shows breach of contract.',
          defense: 'Plaintiff changed specifications repeatedly.',
        }),
        usage: { promptTokens: 300, completionTokens: 400 },
      }),
    } as unknown as jest.Mocked<LLMHttpClientService>;

    mockObservability = {
      emitProgress: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ObservabilityService>;
  });

  it('returns closingArguments on valid LLM response', async () => {
    const node = createClosingArgumentsNode(mockLLMClient, mockObservability);
    const result = await node(buildState());

    expect(result.closingArguments?.plaintiff).toContain('breach of contract');
    expect(result.closingArguments?.defense).toContain(
      'specifications repeatedly',
    );
    expect(result.error).toBeUndefined();
  });

  it('returns error and failed status on JSON parse failure', async () => {
    mockLLMClient.callLLM = jest.fn().mockResolvedValue({
      text: 'This is not JSON',
      usage: { promptTokens: 100, completionTokens: 20 },
    });

    const node = createClosingArgumentsNode(mockLLMClient, mockObservability);
    const result = await node(buildState());

    expect(result.error).toContain('JSON parse failure in closing-arguments');
    expect(result.status).toBe('failed');
  });

  it('accumulates token usage from prior state', async () => {
    const node = createClosingArgumentsNode(mockLLMClient, mockObservability);
    const result = await node(buildState());

    expect(result.tokenUsage?.input).toBe(200 + 300);
    expect(result.tokenUsage?.output).toBe(300 + 400);
  });

  it('emits progress at step closing_arguments progress 65', async () => {
    const node = createClosingArgumentsNode(mockLLMClient, mockObservability);
    await node(buildState());

    expect(mockObservability.emitProgress).toHaveBeenCalledWith(
      mockCtx,
      'conv-123',
      expect.stringContaining('closing arguments'),
      expect.objectContaining({ step: 'closing_arguments', progress: 65 }),
    );
  });
});
