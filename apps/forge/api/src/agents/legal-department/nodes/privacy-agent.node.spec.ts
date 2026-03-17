import { createPrivacyAgentNode } from './privacy-agent.node';
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

const validPrivacyJson = JSON.stringify({
  dataHandling: {
    dataTypes: ['personal data', 'contact information'],
    purposes: ['service delivery', 'analytics'],
    retentionPeriod: '3 years',
    dataLocation: 'EU servers',
    details: 'Standard data processing',
  },
  gdprCompliance: {
    applicable: true,
    legalBasis: 'contract',
    dataSubjectRights: ['access', 'erasure', 'portability'],
    crossBorderTransfers: {
      applicable: true,
      mechanism: 'SCCs',
      details: 'Standard contractual clauses used',
    },
    compliant: true,
    details: 'GDPR compliant',
  },
  ccpaCompliance: {
    applicable: false,
    compliant: true,
    details: 'Not applicable',
  },
  security: {
    measures: ['encryption', 'access controls'],
    adequate: true,
    details: 'Security measures in place',
  },
  riskFlags: [],
  confidence: 0.85,
  summary: 'Privacy agreement analyzed and compliant.',
});

function createMockLLMClient(
  responseText = validPrivacyJson,
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
    userMessage: 'Analyze privacy policy',
    documents: [
      {
        name: 'dpa.pdf',
        content:
          'data processing agreement content with personal data protection',
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

describe('createPrivacyAgentNode', () => {
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;
  let privacyAgentNode: ReturnType<typeof createPrivacyAgentNode>;

  beforeEach(() => {
    mockLLMClient = createMockLLMClient();
    mockObservability = createMockObservability();
    privacyAgentNode = createPrivacyAgentNode(mockLLMClient, mockObservability);
  });

  it('should return a function', () => {
    expect(typeof privacyAgentNode).toBe('function');
  });

  it('should return analysis in specialistOutputs.privacy', async () => {
    const result = await privacyAgentNode(createBaseState());
    expect(result.specialistOutputs?.privacy).toBeDefined();
    expect(result.specialistOutputs?.privacy?.dataHandling).toBeDefined();
  });

  it('should return failed when no document content', async () => {
    const result = await privacyAgentNode(
      createBaseState({ documents: [], legalMetadata: undefined }),
    );
    expect(result.status).toBe('failed');
    expect(result.error).toContain('No document content');
  });

  it('should handle markdown code block responses', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '```json\n' + validPrivacyJson + '\n```',
    });
    const result = await privacyAgentNode(createBaseState());
    expect(result.specialistOutputs?.privacy).toBeDefined();
  });

  it('should handle plain code block responses', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '```\n' + validPrivacyJson + '\n```',
    });
    const result = await privacyAgentNode(createBaseState());
    expect(result.specialistOutputs?.privacy).toBeDefined();
  });

  it('should create fallback analysis when JSON parsing fails', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'not valid json' });
    const result = await privacyAgentNode(createBaseState());
    expect(result.specialistOutputs?.privacy?.riskFlags).toContainEqual(
      expect.objectContaining({ flag: 'analysis-incomplete' }),
    );
  });

  describe('playbook rules', () => {
    it('should flag missing EU transfer mechanism', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          dataHandling: {
            dataTypes: ['personal data'],
            purposes: ['delivery'],
            retentionPeriod: '1 year',
            details: 'data handling',
          },
          gdprCompliance: {
            applicable: true,
            dataSubjectRights: ['access'],
            crossBorderTransfers: {
              applicable: true,
              mechanism: 'none',
              details: 'No mechanism',
            },
            compliant: false,
            details: 'Non-compliant',
          },
          riskFlags: [],
          confidence: 0.8,
          summary: 'Missing transfer mechanism',
        }),
      });
      const result = await privacyAgentNode(createBaseState());
      expect(result.specialistOutputs?.privacy?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'missing-transfer-mechanism' }),
      );
    });

    it('should flag unclear retention period', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          dataHandling: {
            dataTypes: ['personal data'],
            purposes: ['delivery'],
            details: 'no retention specified',
          },
          riskFlags: [],
          confidence: 0.8,
          summary: 'No retention period',
        }),
      });
      const result = await privacyAgentNode(createBaseState());
      expect(result.specialistOutputs?.privacy?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'unclear-retention-period' }),
      );
    });

    it('should flag missing data subject rights for GDPR', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          dataHandling: {
            dataTypes: ['personal data'],
            purposes: ['delivery'],
            retentionPeriod: '1 year',
            details: 'data handling',
          },
          gdprCompliance: {
            applicable: true,
            dataSubjectRights: [],
            compliant: false,
            details: 'Missing rights',
          },
          riskFlags: [],
          confidence: 0.8,
          summary: 'Missing rights',
        }),
      });
      const result = await privacyAgentNode(createBaseState());
      expect(result.specialistOutputs?.privacy?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'missing-data-subject-rights' }),
      );
    });

    it('should not flag SCCs when mechanism is valid', async () => {
      const result = await privacyAgentNode(createBaseState());
      const sccFlag = result.specialistOutputs?.privacy?.riskFlags?.find(
        (f) => f.flag === 'missing-transfer-mechanism',
      );
      expect(sccFlag).toBeUndefined();
    });
  });

  it('should return failed on LLM error', async () => {
    mockLLMClient.callLLM.mockRejectedValue(new Error('LLM error'));
    const result = await privacyAgentNode(createBaseState());
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Privacy Agent:');
  });

  it('should use metadata sections when no documents', async () => {
    const state = createBaseState({
      documents: [],
      legalMetadata: {
        documentType: { type: 'dpa', confidence: 0.9 },
        sections: {
          sections: [
            {
              title: 'Data Processing',
              type: 'data',
              startIndex: 0,
              endIndex: 100,
              content: 'privacy data processing content',
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
    const result = await privacyAgentNode(state);
    expect(result.specialistOutputs?.privacy).toBeDefined();
  });

  it('should emit progress events', async () => {
    await privacyAgentNode(createBaseState());
    expect(mockObservability.emitProgress).toHaveBeenCalledTimes(2);
  });
});
