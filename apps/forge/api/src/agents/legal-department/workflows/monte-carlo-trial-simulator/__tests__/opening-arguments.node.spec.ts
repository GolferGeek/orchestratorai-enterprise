import { createOpeningArgumentsNode } from '../nodes/opening-arguments.node';
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
    openingArguments: undefined,
    evidencePhaseResults: [],
    closingArguments: undefined,
    deliberationOutput: undefined,
    simulationResult: undefined,
    status: 'processing',
    error: undefined,
    startedAt: Date.now(),
    tokenUsage: { input: 0, output: 0 },
    ...overrides,
  } as TrialSimulationState;
}

describe('openingArgumentsNode', () => {
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;

  beforeEach(() => {
    mockLLMClient = {
      callLLM: jest.fn(),
    } as unknown as jest.Mocked<LLMHttpClientService>;

    mockObservability = {
      emitProgress: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ObservabilityService>;
  });

  it('returns openingArguments on valid LLM response', async () => {
    const validResponse = JSON.stringify({
      plaintiff:
        'Ladies and gentlemen of the jury, the defendant failed to deliver.',
      defense:
        'The plaintiff changed the specs 8 times, making delivery impossible.',
    });

    mockLLMClient.callLLM = jest.fn().mockResolvedValue({
      text: validResponse,
      usage: { promptTokens: 100, completionTokens: 200 },
    });

    const node = createOpeningArgumentsNode(mockLLMClient, mockObservability);
    const result = await node(buildState());

    expect(result.openingArguments?.plaintiff).toContain('failed to deliver');
    expect(result.openingArguments?.defense).toContain('specs 8 times');
    expect(result.tokenUsage?.input).toBe(100);
    expect(result.tokenUsage?.output).toBe(200);
    expect(result.error).toBeUndefined();
  });

  it('returns error and failed status on JSON parse failure', async () => {
    mockLLMClient.callLLM = jest.fn().mockResolvedValue({
      text: 'not valid json at all',
      usage: { promptTokens: 50, completionTokens: 10 },
    });

    const node = createOpeningArgumentsNode(mockLLMClient, mockObservability);
    const result = await node(buildState());

    expect(result.error).toContain('JSON parse failure in opening-arguments');
    expect(result.status).toBe('failed');
    expect(result.openingArguments).toBeUndefined();
  });

  it('returns error when required fields missing from JSON', async () => {
    mockLLMClient.callLLM = jest.fn().mockResolvedValue({
      text: JSON.stringify({ plaintiff: 'Only plaintiff side' }),
      usage: { promptTokens: 50, completionTokens: 30 },
    });

    const node = createOpeningArgumentsNode(mockLLMClient, mockObservability);
    const result = await node(buildState());

    expect(result.error).toContain('JSON parse failure in opening-arguments');
    expect(result.status).toBe('failed');
  });

  it('emits progress with correct step and progress value', async () => {
    mockLLMClient.callLLM = jest.fn().mockResolvedValue({
      text: JSON.stringify({ plaintiff: 'p', defense: 'd' }),
      usage: { promptTokens: 10, completionTokens: 10 },
    });

    const node = createOpeningArgumentsNode(mockLLMClient, mockObservability);
    await node(buildState());

    expect(mockObservability.emitProgress).toHaveBeenCalledWith(
      mockCtx,
      'conv-123',
      expect.stringContaining('opening arguments'),
      expect.objectContaining({ step: 'opening_arguments', progress: 15 }),
    );
  });
});
