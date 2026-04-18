import { createEvidencePresentationNode } from '../nodes/evidence-presentation.node';
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
  const parameters = generateSimulationParameters(TEST_CASE_RECORD, 0, 1);
  // Admit all evidence for default state
  for (const e of TEST_CASE_RECORD.evidence) {
    parameters.evidenceAdmissibility[e.evidenceId] = true;
  }
  return {
    messages: [],
    executionContext: mockCtx,
    caseRecord: TEST_CASE_RECORD,
    parameters,
    openingArguments: undefined,
    evidencePhaseResults: [],
    closingArguments: undefined,
    deliberationOutput: undefined,
    simulationResult: undefined,
    status: 'processing',
    error: undefined,
    startedAt: Date.now(),
    tokenUsage: { input: 50, output: 80 },
    ...overrides,
  } as TrialSimulationState;
}

const validItemResponse = JSON.stringify({
  objection: 'Objection, hearsay.',
  ruling: 'Admitted',
  juryImpact:
    'The jury leans forward — this evidence is damaging to the defense.',
});

describe('evidencePresentationNode', () => {
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;

  beforeEach(() => {
    mockLLMClient = {
      callLLM: jest.fn().mockResolvedValue({
        text: validItemResponse,
        usage: { promptTokens: 80, completionTokens: 60 },
      }),
    } as unknown as jest.Mocked<LLMHttpClientService>;

    mockObservability = {
      emitProgress: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ObservabilityService>;
  });

  it('returns one result per admitted evidence item', async () => {
    const node = createEvidencePresentationNode(
      mockLLMClient,
      mockObservability,
    );
    const result = await node(buildState());

    expect(result.evidencePhaseResults).toHaveLength(
      TEST_CASE_RECORD.evidence.length,
    );
    expect(result.evidencePhaseResults?.[0]?.admitted).toBe(true);
    expect(result.evidencePhaseResults?.[0]?.ruling).toBe('Admitted');
  });

  it('skips evidence items where admissibility is false', async () => {
    const state = buildState();
    state.parameters.evidenceAdmissibility['ev-4'] = false;
    state.parameters.evidenceAdmissibility['ev-5'] = false;

    const node = createEvidencePresentationNode(
      mockLLMClient,
      mockObservability,
    );
    const result = await node(state);

    expect(result.evidencePhaseResults).toHaveLength(3);
    expect(result.evidencePhaseResults?.map((r) => r.evidenceId)).not.toContain(
      'ev-4',
    );
    expect(result.evidencePhaseResults?.map((r) => r.evidenceId)).not.toContain(
      'ev-5',
    );
  });

  it('marks item with error on JSON parse failure but continues processing', async () => {
    mockLLMClient.callLLM = jest
      .fn()
      .mockResolvedValueOnce({
        text: 'not json',
        usage: { promptTokens: 10, completionTokens: 5 },
      })
      .mockResolvedValue({
        text: validItemResponse,
        usage: { promptTokens: 80, completionTokens: 60 },
      });

    const node = createEvidencePresentationNode(
      mockLLMClient,
      mockObservability,
    );
    const result = await node(buildState());

    expect(result.evidencePhaseResults).toHaveLength(
      TEST_CASE_RECORD.evidence.length,
    );
    expect(result.evidencePhaseResults?.[0]?.error).toContain(
      'JSON parse failure',
    );
    expect(result.evidencePhaseResults?.[1]?.error).toBeUndefined();
    expect(result.status).toBeUndefined(); // simulation not failed — continues
  });

  it('rolling context window: LLM call after 3rd item includes recent summary', async () => {
    const node = createEvidencePresentationNode(
      mockLLMClient,
      mockObservability,
    );
    await node(buildState());

    // The 4th and 5th calls should include "Recently presented evidence" in the user message
    const calls = (mockLLMClient.callLLM as jest.Mock).mock.calls;
    if (calls.length >= 4) {
      const fourthCallArgs = calls[3][0] as { userMessage: string };
      expect(fourthCallArgs.userMessage).toContain(
        'Recently presented evidence',
      );
    }
  });

  it('accumulates token usage from prior state', async () => {
    const node = createEvidencePresentationNode(
      mockLLMClient,
      mockObservability,
    );
    const result = await node(buildState()); // prior tokenUsage: { input: 50, output: 80 }

    // 5 evidence items × 80 input tokens = 400 + 50 prior = 450
    expect(result.tokenUsage?.input).toBe(
      50 + 80 * TEST_CASE_RECORD.evidence.length,
    );
    expect(result.tokenUsage?.output).toBe(
      80 + 60 * TEST_CASE_RECORD.evidence.length,
    );
  });

  it('marks item as excluded when ruling starts with Excluded', async () => {
    mockLLMClient.callLLM = jest.fn().mockResolvedValue({
      text: JSON.stringify({
        objection: 'Objection, authentication.',
        ruling: 'Excluded — fails authentication requirements',
        juryImpact: 'Jury shows disappointment.',
      }),
      usage: { promptTokens: 80, completionTokens: 60 },
    });

    const node = createEvidencePresentationNode(
      mockLLMClient,
      mockObservability,
    );
    const result = await node(buildState());

    expect(result.evidencePhaseResults?.[0]?.admitted).toBe(false);
  });
});
