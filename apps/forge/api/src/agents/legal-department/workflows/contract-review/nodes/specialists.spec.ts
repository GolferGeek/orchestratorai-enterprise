import {
  createContractReviewSpecialists,
  SPECIALIST_CONFIGS,
} from './specialists';
import { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../../shared/services/observability.service';
import { LegalDepartmentState } from '../../../legal-department.state';

const mockLLMClient = {
  callLLM: jest.fn().mockResolvedValue({
    text: JSON.stringify([
      {
        clauseId: 's1-c1',
        riskLevel: 'high',
        category: 'indemnification',
        finding: 'Broad indemnification clause.',
        suggestedLanguage: 'Limit indemnification to direct damages.',
        reasoning: 'Exposes party to unlimited liability.',
      },
    ]),
  }),
} as unknown as jest.Mocked<LLMHttpClientService>;

const mockObservability = {
  emitProgress: jest.fn().mockResolvedValue(undefined),
  emitFailed: jest.fn().mockResolvedValue(undefined),
} as unknown as jest.Mocked<ObservabilityService>;

function createBaseState(): LegalDepartmentState {
  return {
    executionContext: {
      orgSlug: 'test-org',
      userId: 'test-user',
      conversationId: 'conv-cr-test',
      agentSlug: 'legal-department',
      agentType: 'langgraph',
      provider: 'ollama',
      model: 'gemma4:31b',
    },
    userMessage: 'Review this contract',
    documents: [{ name: 'contract.pdf', content: 'Contract text...' }],
    documentsMetadata: [],
    messages: [],
    routingDecision: undefined,
    orchestration: {},
    specialistOutputs: {},
    outputMode: 'contract-review',
    clauseMap: {
      entries: [
        {
          clauseId: 's1-c1',
          sectionPath: '1',
          text: 'Indemnification clause text',
          definedTermsReferenced: [],
          sectionLevel: false,
          entryType: 'clause',
        },
      ],
      definedTerms: {},
      sectionCount: 1,
      clauseCount: 1,
    },
    clauseMapUndefined: undefined,
    redlineOutput: undefined,
    response: undefined,
    status: 'processing',
    error: undefined,
    startedAt: Date.now(),
    completedAt: undefined,
  } as unknown as LegalDepartmentState;
}

describe('createContractReviewSpecialists', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates all 8 specialist nodes', () => {
    const specialists = createContractReviewSpecialists(
      mockLLMClient,
      mockObservability,
    );

    expect(Object.keys(specialists)).toHaveLength(8);
    expect(specialists.contract).toBeDefined();
    expect(specialists.compliance).toBeDefined();
    expect(specialists.ip).toBeDefined();
    expect(specialists.privacy).toBeDefined();
    expect(specialists.employment).toBeDefined();
    expect(specialists.corporate).toBeDefined();
    expect(specialists.litigation).toBeDefined();
    expect(specialists.realEstate).toBeDefined();
  });

  it('each specialist calls LLM and returns annotations in specialistOutputs', async () => {
    const specialists = createContractReviewSpecialists(
      mockLLMClient,
      mockObservability,
    );
    const state = createBaseState();

    const result = await specialists.contract!(state);

    expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(1);
    expect(result.specialistOutputs).toBeDefined();
    expect(result.specialistOutputs!.contract).toBeDefined();
    const annotations = result.specialistOutputs!
      .contract as unknown as unknown[];
    expect(Array.isArray(annotations)).toBe(true);
    expect(annotations).toHaveLength(1);
  });

  it('specialist returns failed status when LLM throws', async () => {
    const failingLLM = {
      callLLM: jest.fn().mockRejectedValue(new Error('LLM timeout')),
    } as unknown as jest.Mocked<LLMHttpClientService>;

    const specialists = createContractReviewSpecialists(
      failingLLM,
      mockObservability,
    );
    const state = createBaseState();

    const result = await specialists.contract!(state);

    expect(result.status).toBe('failed');
    expect(result.error).toContain('LLM timeout');
  });

  it('has exactly 8 specialist configs', () => {
    expect(SPECIALIST_CONFIGS).toHaveLength(8);
    const keys = SPECIALIST_CONFIGS.map((c) => c.key);
    expect(keys).toEqual([
      'contract',
      'compliance',
      'ip',
      'privacy',
      'employment',
      'corporate',
      'litigation',
      'realEstate',
    ]);
  });
});
