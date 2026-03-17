import { createContractAgentNode } from './contract-agent.node';
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

const validContractAnalysisJson = JSON.stringify({
  clauses: {
    term: { duration: '2 years', startDate: '2024-01-01' },
    confidentiality: { period: '3 years', scope: 'all business information' },
    governingLaw: {
      jurisdiction: 'Delaware',
      disputeResolution: 'arbitration',
    },
    termination: { forCause: 'with notice', noticePeriod: '30 days' },
  },
  contractType: { type: 'nda', isMutual: true },
  riskFlags: [],
  confidence: 0.9,
  summary: 'This is a mutual NDA with standard terms.',
});

function createMockLLMClient(
  responseText = validContractAnalysisJson,
): jest.Mocked<LLMHttpClientService> {
  return {
    callLLM: jest.fn().mockResolvedValue({ text: responseText }),
  } as unknown as jest.Mocked<LLMHttpClientService>;
}

function createMockObservability(): jest.Mocked<ObservabilityService> {
  return {
    emitProgress: jest.fn().mockResolvedValue(undefined),
    emitStarted: jest.fn().mockResolvedValue(undefined),
    emitCompleted: jest.fn().mockResolvedValue(undefined),
    emitFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ObservabilityService>;
}

function createBaseState(
  overrides: Partial<LegalDepartmentState> = {},
): LegalDepartmentState {
  return {
    executionContext: mockCtx,
    userMessage: 'Analyze this contract',
    documents: [
      {
        name: 'contract.pdf',
        content: 'This is a contract document with terms and conditions.',
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

describe('createContractAgentNode', () => {
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;
  let contractAgentNode: ReturnType<typeof createContractAgentNode>;

  beforeEach(() => {
    mockLLMClient = createMockLLMClient();
    mockObservability = createMockObservability();
    contractAgentNode = createContractAgentNode(
      mockLLMClient,
      mockObservability,
    );
  });

  describe('basic functionality', () => {
    it('should return a function', () => {
      expect(typeof contractAgentNode).toBe('function');
    });

    it('should call LLM with contract analysis prompt', async () => {
      const state = createBaseState();
      await contractAgentNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          context: mockCtx,
          callerName: 'legal-department:contract-agent',
          temperature: 0.3,
        }),
      );
    });

    it('should return analysis in specialistOutputs.contract', async () => {
      const state = createBaseState();
      const result = await contractAgentNode(state);
      expect(result.specialistOutputs?.contract).toBeDefined();
    });

    it('should emit progress events', async () => {
      const state = createBaseState();
      await contractAgentNode(state);
      expect(mockObservability.emitProgress).toHaveBeenCalledTimes(2);
    });
  });

  describe('document text extraction', () => {
    it('should use documents array content', async () => {
      const state = createBaseState({
        documents: [{ name: 'contract.pdf', content: 'contract content here' }],
      });
      await contractAgentNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: expect.stringContaining('contract content here'),
        }),
      );
    });

    it('should extract text from legal metadata sections when no documents', async () => {
      const state = createBaseState({
        documents: [],
        legalMetadata: {
          documentType: { type: 'contract', confidence: 0.9 },
          sections: {
            sections: [
              {
                title: 'Terms',
                type: 'terms',
                startIndex: 0,
                endIndex: 100,
                content: 'section content from metadata',
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
      await contractAgentNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: expect.stringContaining('section content from metadata'),
        }),
      );
    });

    it('should return failed status when no document content available', async () => {
      const state = createBaseState({
        documents: [],
        legalMetadata: undefined,
      });
      const result = await contractAgentNode(state);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('No document content');
    });
  });

  describe('JSON parsing', () => {
    it('should parse valid JSON response', async () => {
      const state = createBaseState();
      const result = await contractAgentNode(state);
      expect(result.specialistOutputs?.contract?.summary).toBe(
        'This is a mutual NDA with standard terms.',
      );
      expect(result.specialistOutputs?.contract?.contractType.type).toBe('nda');
    });

    it('should handle markdown code blocks in JSON response', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: '```json\n' + validContractAnalysisJson + '\n```',
      });
      const state = createBaseState();
      const result = await contractAgentNode(state);
      expect(result.specialistOutputs?.contract).toBeDefined();
      expect(result.specialistOutputs?.contract?.summary).toBeDefined();
    });

    it('should handle plain code blocks', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: '```\n' + validContractAnalysisJson + '\n```',
      });
      const state = createBaseState();
      const result = await contractAgentNode(state);
      expect(result.specialistOutputs?.contract).toBeDefined();
    });

    it('should create fallback analysis when JSON parsing fails', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: 'This is not valid JSON at all.',
      });
      const state = createBaseState();
      const result = await contractAgentNode(state);
      expect(result.specialistOutputs?.contract).toBeDefined();
      expect(result.specialistOutputs?.contract?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'analysis-incomplete' }),
      );
    });

    it('should throw error when required JSON fields missing', async () => {
      // Missing clauses, contractType, and summary
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({ riskFlags: [], confidence: 0.5 }),
      });
      const state = createBaseState();
      // Should fall back gracefully
      const result = await contractAgentNode(state);
      expect(result.specialistOutputs?.contract).toBeDefined();
    });
  });

  describe('playbook rules', () => {
    it('should flag one-sided agreements', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          clauses: { governingLaw: { jurisdiction: 'Delaware' } },
          contractType: { type: 'nda', isMutual: false },
          riskFlags: [],
          confidence: 0.9,
          summary: 'One-sided NDA',
        }),
      });
      const state = createBaseState();
      const result = await contractAgentNode(state);
      expect(result.specialistOutputs?.contract?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'one-sided-agreement' }),
      );
    });

    it('should flag contracts with term > 5 years', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          clauses: {
            term: { duration: '7 years' },
            governingLaw: { jurisdiction: 'Delaware' },
          },
          contractType: { type: 'msa', isMutual: true },
          riskFlags: [],
          confidence: 0.9,
          summary: 'Long term MSA',
        }),
      });
      const state = createBaseState();
      const result = await contractAgentNode(state);
      expect(result.specialistOutputs?.contract?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'long-term-commitment' }),
      );
    });

    it('should flag perpetual term', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          clauses: {
            term: { duration: 'perpetual' },
            governingLaw: { jurisdiction: 'Delaware' },
          },
          contractType: { type: 'nda', isMutual: true },
          riskFlags: [],
          confidence: 0.9,
          summary: 'Perpetual NDA',
        }),
      });
      const state = createBaseState();
      const result = await contractAgentNode(state);
      expect(result.specialistOutputs?.contract?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'perpetual-term' }),
      );
    });

    it('should flag missing governing law', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          clauses: {},
          contractType: { type: 'nda', isMutual: true },
          riskFlags: [],
          confidence: 0.9,
          summary: 'NDA without governing law',
        }),
      });
      const state = createBaseState();
      const result = await contractAgentNode(state);
      expect(result.specialistOutputs?.contract?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'no-governing-law' }),
      );
    });

    it('should flag perpetual confidentiality period', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          clauses: {
            confidentiality: { period: 'indefinite', scope: 'all information' },
            governingLaw: { jurisdiction: 'New York' },
          },
          contractType: { type: 'nda', isMutual: true },
          riskFlags: [],
          confidence: 0.9,
          summary: 'NDA with indefinite confidentiality',
        }),
      });
      const state = createBaseState();
      const result = await contractAgentNode(state);
      expect(result.specialistOutputs?.contract?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'perpetual-confidentiality' }),
      );
    });
  });

  describe('metadata context in user message', () => {
    it('should include metadata context when available', async () => {
      const state = createBaseState({
        legalMetadata: {
          documentType: { type: 'NDA', confidence: 0.9 },
          sections: { sections: [], confidence: 0.5, structureType: 'formal' },
          signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
          dates: {
            dates: [],
            primaryDate: {
              originalText: 'Jan 1, 2024',
              normalizedDate: '2024-01-01',
              dateType: 'effective',
              confidence: 0.9,
              position: 0,
            },
            confidence: 0.9,
          },
          parties: {
            parties: [],
            contractingParties: [
              {
                name: 'Acme Corp',
                type: 'corporate',
                position: 0,
                confidence: 0.9,
              },
              {
                name: 'Widget Inc',
                type: 'corporate',
                position: 50,
                confidence: 0.9,
              },
            ] as [
              {
                name: string;
                type: string;
                position: number;
                confidence: number;
              },
              {
                name: string;
                type: string;
                position: number;
                confidence: number;
              },
            ],
            confidence: 0.9,
          },
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
      await contractAgentNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: expect.stringContaining('Acme Corp'),
        }),
      );
    });

    it("should include user message in prompt when not just 'analyze'", async () => {
      const state = createBaseState({
        userMessage: 'Focus on confidentiality terms',
      });
      await contractAgentNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: expect.stringContaining(
            'Focus on confidentiality terms',
          ),
        }),
      );
    });

    it("should not include user message when just 'analyze'", async () => {
      const state = createBaseState({ userMessage: 'analyze' });
      await contractAgentNode(state);
      const callArgs = mockLLMClient.callLLM.mock.calls[0]![0];
      expect(callArgs.userMessage).not.toContain('User Request: analyze');
    });
  });

  describe('error handling', () => {
    it('should return failed status when LLM throws', async () => {
      mockLLMClient.callLLM.mockRejectedValue(new Error('LLM unavailable'));
      const state = createBaseState();
      const result = await contractAgentNode(state);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Contract Agent:');
    });

    it('should emit failure event on error', async () => {
      mockLLMClient.callLLM.mockRejectedValue(new Error('LLM timeout'));
      const state = createBaseState();
      await contractAgentNode(state);
      expect(mockObservability.emitFailed).toHaveBeenCalled();
    });

    it('should preserve existing specialistOutputs on success', async () => {
      const state = createBaseState({
        specialistOutputs: {
          compliance: {
            policyChecks: {},
            regulatoryCompliance: {
              regulations: [],
              status: 'not-applicable',
              details: 'N/A',
            },
            riskFlags: [],
            confidence: 0.8,
            summary: 'compliance done',
          },
        },
      });
      const result = await contractAgentNode(state);
      expect(result.specialistOutputs?.compliance).toBeDefined();
      expect(result.specialistOutputs?.contract).toBeDefined();
    });
  });
});
