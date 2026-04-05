import { createRealEstateAgentNode } from './real-estate-agent.node';
import { LegalDepartmentState } from '../legal-department.state';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../shared/services/observability.service';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

const mockCtx: ExecutionContext = {
  orgSlug: 'test-org',
  userId: 'test-user',
  conversationId: 'conv-123',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
};

const validRealEstateJson = JSON.stringify({
  propertyInfo: {
    address: '123 Main St',
    propertyType: 'commercial',
    details: 'Office building',
  },
  leaseTerms: {
    landlord: 'Property Owner LLC',
    tenant: 'Tenant Corp',
    term: '5 years',
    rent: { baseRent: '$10,000/month', escalations: '3% annual' },
    permittedUse: 'Office use only',
    securityDeposit: '$20,000',
    details: 'Standard commercial lease with insurance requirements',
  },
  titleIssues: {
    exceptions: [
      {
        type: 'easement',
        description: 'Utility easement',
        requiresAction: false,
      },
    ],
    encumbrances: [],
    clearTitle: true,
    details: 'Clear title with minor easement',
  },
  warranties: {
    propertyCondition: 'as-is',
    environmentalCompliance: 'compliant',
    details: 'Standard warranties',
  },
  riskFlags: [],
  confidence: 0.85,
  summary: 'Commercial lease analyzed successfully.',
});

function createMockLLMClient(
  responseText = validRealEstateJson,
): jest.Mocked<LLMHttpClientService> {
  return {
    callLLM: jest.fn().mockResolvedValue({ text: responseText }),
  } as unknown as jest.Mocked<LLMHttpClientService>;
}

function createMockObservability(): jest.Mocked<ObservabilityService> {
  return {
    emitProgress: jest.fn().mockResolvedValue(undefined),
    emitFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ObservabilityService>;
}

function createBaseState(
  overrides: Partial<LegalDepartmentState> = {},
): LegalDepartmentState {
  return {
    executionContext: mockCtx,
    userMessage: 'Analyze lease',
    documents: [
      {
        name: 'lease.pdf',
        content: 'commercial lease agreement for office space',
      },
    ],
    legalMetadata: undefined,
    routingDecision: undefined,
    orchestration: {},
    specialistOutputs: {},
    response: undefined,
    status: 'processing',
    error: undefined,
    startedAt: Date.now(),
    completedAt: undefined,
    messages: [],
    ...overrides,
  };
}

describe('createRealEstateAgentNode', () => {
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;
  let realEstateAgentNode: ReturnType<typeof createRealEstateAgentNode>;

  beforeEach(() => {
    mockLLMClient = createMockLLMClient();
    mockObservability = createMockObservability();
    realEstateAgentNode = createRealEstateAgentNode(
      mockLLMClient,
      mockObservability,
    );
  });

  it('should return a function', () => {
    expect(typeof realEstateAgentNode).toBe('function');
  });

  it('should return analysis in specialistOutputs.realEstate', async () => {
    const result = await realEstateAgentNode(createBaseState());
    expect(result.specialistOutputs?.realEstate).toBeDefined();
    expect(result.specialistOutputs?.realEstate?.propertyInfo).toBeDefined();
  });

  it('should return failed when no document content', async () => {
    const result = await realEstateAgentNode(
      createBaseState({ documents: [], legalMetadata: undefined }),
    );
    expect(result.status).toBe('failed');
    expect(result.error).toContain('No document content');
  });

  it('should handle markdown code block responses', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '```json\n' + validRealEstateJson + '\n```',
    });
    const result = await realEstateAgentNode(createBaseState());
    expect(result.specialistOutputs?.realEstate).toBeDefined();
  });

  it('should handle plain code block responses', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '```\n' + validRealEstateJson + '\n```',
    });
    const result = await realEstateAgentNode(createBaseState());
    expect(result.specialistOutputs?.realEstate).toBeDefined();
  });

  it('should return failed status when LLM returns unparseable JSON', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'not valid json' });
    const result = await realEstateAgentNode(createBaseState());
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Failed to parse LLM response');
  });

  describe('playbook rules', () => {
    it('should flag title exceptions requiring action', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          propertyInfo: { details: 'Office building' },
          titleIssues: {
            exceptions: [
              {
                type: 'lien',
                description: "Outstanding mechanic's lien",
                requiresAction: true,
              },
            ],
            encumbrances: [],
            clearTitle: false,
            details: 'Title issues present',
          },
          riskFlags: [],
          confidence: 0.8,
          summary: 'Title issues found',
        }),
      });
      const result = await realEstateAgentNode(createBaseState());
      expect(result.specialistOutputs?.realEstate?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'title-exception-requires-action' }),
      );
    });

    it('should flag unclear title', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          propertyInfo: { details: 'Office building' },
          titleIssues: {
            exceptions: [],
            encumbrances: [
              {
                type: 'mortgage',
                description: 'Outstanding mortgage',
                amount: '$500,000',
              },
            ],
            clearTitle: false,
            details: 'Title not clear',
          },
          riskFlags: [],
          confidence: 0.8,
          summary: 'Unclear title',
        }),
      });
      const result = await realEstateAgentNode(createBaseState());
      expect(result.specialistOutputs?.realEstate?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'unclear-title' }),
      );
    });

    it('should flag unusually long lease (> 20 years)', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          propertyInfo: { details: 'Office building' },
          leaseTerms: { term: '25 years', details: 'Long-term lease' },
          riskFlags: [],
          confidence: 0.8,
          summary: 'Very long lease',
        }),
      });
      const result = await realEstateAgentNode(createBaseState());
      expect(result.specialistOutputs?.realEstate?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'unusually-long-lease' }),
      );
    });

    it('should flag missing insurance requirements', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          propertyInfo: { details: 'Office building' },
          leaseTerms: {
            term: '5 years',
            details: 'Standard lease without coverage requirements',
          },
          riskFlags: [],
          confidence: 0.8,
          summary: 'Missing insurance',
        }),
      });
      const result = await realEstateAgentNode(createBaseState());
      expect(result.specialistOutputs?.realEstate?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'missing-insurance-requirements' }),
      );
    });

    it('should not flag insurance when details mention insurance', async () => {
      // validRealEstateJson has "insurance requirements" in details
      const result = await realEstateAgentNode(createBaseState());
      const insuranceFlag =
        result.specialistOutputs?.realEstate?.riskFlags?.find(
          (f) => f.flag === 'missing-insurance-requirements',
        );
      expect(insuranceFlag).toBeUndefined();
    });
  });

  it('should return failed on LLM error', async () => {
    mockLLMClient.callLLM.mockRejectedValue(new Error('LLM error'));
    const result = await realEstateAgentNode(createBaseState());
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Real Estate Agent:');
  });

  it('should use metadata sections when no documents', async () => {
    const state = createBaseState({
      documents: [],
      legalMetadata: {
        documentType: { type: 'lease', confidence: 0.9 },
        sections: {
          sections: [
            {
              title: 'Lease Terms',
              type: 'terms',
              startIndex: 0,
              endIndex: 100,
              content: 'commercial lease agreement content',
              confidence: 0.9,
            },
          ],
          confidence: 0.9,
          structureType: 'formal',
        },
        signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
        dates: { dates: [], confidence: 0.5 },
        parties: { parties: [], confidence: 0.5 },
        confidence: {
          overall: 0.9,
          breakdown: {},
          factors: {
            textQuality: 0.9,
            extractionMethod: 'native',
            completeness: 0.9,
            patternMatchCount: 5,
          },
        },
        extractedAt: new Date().toISOString(),
      },
    });
    const result = await realEstateAgentNode(state);
    expect(result.specialistOutputs?.realEstate).toBeDefined();
  });

  it('should emit progress events', async () => {
    await realEstateAgentNode(createBaseState());
    expect(mockObservability.emitProgress).toHaveBeenCalledTimes(2);
  });

  it("should include user message when not just 'analyze'", async () => {
    const state = createBaseState({ userMessage: 'Check renewal options' });
    await realEstateAgentNode(state);
    expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.stringContaining('Check renewal options'),
      }),
    );
  });
});
