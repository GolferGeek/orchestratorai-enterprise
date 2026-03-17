import { createEmploymentAgentNode } from './employment-agent.node';
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

const validEmploymentJson = JSON.stringify({
  employmentTerms: {
    type: 'at-will',
    position: 'Software Engineer',
    details: 'Standard at-will employment',
  },
  restrictiveCovenants: {
    nonCompete: { exists: false, enforceable: true, details: 'No non-compete' },
    nonSolicitation: {
      exists: true,
      scope: 'customers',
      duration: '1 year',
      details: 'Standard non-solicit',
    },
    confidentiality: {
      exists: true,
      duration: 'indefinite',
      details: 'Trade secret protection',
    },
  },
  termination: {
    forCause: 'for cause only',
    noticePeriod: '2 weeks',
    severance: 'none',
    details: 'standard',
  },
  riskFlags: [],
  confidence: 0.85,
  summary: 'Standard at-will employment agreement.',
});

function createMockLLMClient(
  responseText = validEmploymentJson,
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
    userMessage: 'Analyze employment agreement',
    documents: [
      {
        name: 'employment.pdf',
        content: 'employment at-will agreement terms and conditions',
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

describe('createEmploymentAgentNode', () => {
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;
  let employmentAgentNode: ReturnType<typeof createEmploymentAgentNode>;

  beforeEach(() => {
    mockLLMClient = createMockLLMClient();
    mockObservability = createMockObservability();
    employmentAgentNode = createEmploymentAgentNode(
      mockLLMClient,
      mockObservability,
    );
  });

  it('should return a function', () => {
    expect(typeof employmentAgentNode).toBe('function');
  });

  it('should return analysis in specialistOutputs.employment', async () => {
    const result = await employmentAgentNode(createBaseState());
    expect(result.specialistOutputs?.employment).toBeDefined();
  });

  it('should return failed when no document content', async () => {
    const result = await employmentAgentNode(
      createBaseState({ documents: [], legalMetadata: undefined }),
    );
    expect(result.status).toBe('failed');
    expect(result.error).toContain('No document content');
  });

  it('should handle markdown code block responses', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '```json\n' + validEmploymentJson + '\n```',
    });
    const result = await employmentAgentNode(createBaseState());
    expect(result.specialistOutputs?.employment).toBeDefined();
  });

  it('should handle plain code block responses', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '```\n' + validEmploymentJson + '\n```',
    });
    const result = await employmentAgentNode(createBaseState());
    expect(result.specialistOutputs?.employment).toBeDefined();
  });

  it('should create fallback analysis when JSON parsing fails', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'not valid json' });
    const result = await employmentAgentNode(createBaseState());
    expect(result.specialistOutputs?.employment?.riskFlags).toContainEqual(
      expect.objectContaining({ flag: 'analysis-incomplete' }),
    );
  });

  describe('playbook rules', () => {
    it('should flag California non-compete', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          employmentTerms: { type: 'at-will', details: 'at-will' },
          restrictiveCovenants: {
            nonCompete: {
              exists: true,
              enforceable: true,
              details: 'non-compete',
            },
          },
          riskFlags: [],
          confidence: 0.8,
          summary: 'CA employment',
        }),
      });
      const state = createBaseState({
        documents: [
          {
            name: 'emp.pdf',
            content: 'employment agreement california non-compete',
          },
        ],
      });
      const result = await employmentAgentNode(state);
      expect(result.specialistOutputs?.employment?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'california-non-compete' }),
      );
    });

    it('should flag missing at-will language', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          employmentTerms: { type: 'at-will', details: 'employment terms' },
          riskFlags: [],
          confidence: 0.8,
          summary: 'Employment without at-will',
        }),
      });
      const state = createBaseState({
        documents: [
          {
            name: 'emp.pdf',
            content: 'employment offer letter for full-time position',
          },
        ],
      });
      const result = await employmentAgentNode(state);
      expect(result.specialistOutputs?.employment?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'missing-at-will-language' }),
      );
    });

    it('should not flag missing at-will when at-will language is present', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          employmentTerms: { type: 'at-will', details: 'at-will employment' },
          riskFlags: [],
          confidence: 0.8,
          summary: 'At-will employment',
        }),
      });
      const state = createBaseState({
        documents: [
          { name: 'emp.pdf', content: 'this is at-will employment agreement' },
        ],
      });
      const result = await employmentAgentNode(state);
      const missingAtWillFlags =
        result.specialistOutputs?.employment?.riskFlags?.filter(
          (f) => f.flag === 'missing-at-will-language',
        );
      expect(missingAtWillFlags).toHaveLength(0);
    });

    it('should flag overly broad non-compete (> 2 years)', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          employmentTerms: { type: 'at-will', details: 'at-will' },
          restrictiveCovenants: {
            nonCompete: {
              exists: true,
              duration: '3 years',
              territory: 'worldwide',
              enforceable: true,
              details: 'broad',
            },
          },
          riskFlags: [],
          confidence: 0.8,
          summary: 'Long non-compete',
        }),
      });
      const result = await employmentAgentNode(createBaseState());
      expect(result.specialistOutputs?.employment?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'overly-broad-non-compete' }),
      );
    });
  });

  describe('risk flag normalization', () => {
    it('should normalize string risk flags', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          employmentTerms: { type: 'at-will', details: 'at-will employment' },
          riskFlags: ['Missing benefits clause'],
          confidence: 0.8,
          summary: 'Employment with string flags',
        }),
      });
      const state = createBaseState({
        documents: [{ name: 'emp.pdf', content: 'this is at-will employment' }],
      });
      const result = await employmentAgentNode(state);
      expect(result.specialistOutputs?.employment?.riskFlags[0]).toHaveProperty(
        'flag',
      );
      expect(result.specialistOutputs?.employment?.riskFlags[0]).toHaveProperty(
        'severity',
      );
      expect(result.specialistOutputs?.employment?.riskFlags[0]).toHaveProperty(
        'description',
      );
    });

    it('should normalize object risk flags with alternate property names', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          employmentTerms: { type: 'at-will', details: 'at-will employment' },
          riskFlags: [
            {
              name: 'missing-benefits',
              severity: 'low',
              details: 'No benefits mentioned',
            },
          ],
          confidence: 0.8,
          summary: 'Employment normalized flags',
        }),
      });
      const state = createBaseState({
        documents: [{ name: 'emp.pdf', content: 'this is at-will employment' }],
      });
      const result = await employmentAgentNode(state);
      expect(result.specialistOutputs?.employment?.riskFlags[0]!.flag).toBe(
        'missing-benefits',
      );
    });

    it('should handle invalid severity values with default medium', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          employmentTerms: { type: 'at-will', details: 'at-will employment' },
          riskFlags: [
            { flag: 'test-flag', severity: 'invalid', description: 'test' },
          ],
          confidence: 0.8,
          summary: 'Test',
        }),
      });
      const state = createBaseState({
        documents: [{ name: 'emp.pdf', content: 'this is at-will employment' }],
      });
      const result = await employmentAgentNode(state);
      expect(result.specialistOutputs?.employment?.riskFlags[0]!.severity).toBe(
        'medium',
      );
    });

    it('should handle null values in riskFlags array', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          employmentTerms: { type: 'at-will', details: 'at-will employment' },
          riskFlags: [null, 42],
          confidence: 0.8,
          summary: 'Test',
        }),
      });
      const state = createBaseState({
        documents: [{ name: 'emp.pdf', content: 'this is at-will employment' }],
      });
      const result = await employmentAgentNode(state);
      // Should handle gracefully
      expect(result.specialistOutputs?.employment?.riskFlags).toBeDefined();
    });
  });

  it('should return failed on LLM error', async () => {
    mockLLMClient.callLLM.mockRejectedValue(new Error('LLM error'));
    const result = await employmentAgentNode(createBaseState());
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Employment Agent:');
  });

  it('should use metadata sections when no documents', async () => {
    const state = createBaseState({
      documents: [],
      legalMetadata: {
        documentType: { type: 'employment', confidence: 0.9 },
        sections: {
          sections: [
            {
              title: 'Terms',
              type: 'terms',
              startIndex: 0,
              endIndex: 100,
              content: 'employment at will terms',
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
    const result = await employmentAgentNode(state);
    expect(result.specialistOutputs?.employment).toBeDefined();
  });

  it('should emit progress events', async () => {
    await employmentAgentNode(createBaseState());
    expect(mockObservability.emitProgress).toHaveBeenCalledTimes(2);
  });

  it("should include user message when not just 'analyze'", async () => {
    const state = createBaseState({
      userMessage: 'Focus on non-compete terms',
    });
    await employmentAgentNode(state);
    expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.stringContaining('Focus on non-compete terms'),
      }),
    );
  });
});
