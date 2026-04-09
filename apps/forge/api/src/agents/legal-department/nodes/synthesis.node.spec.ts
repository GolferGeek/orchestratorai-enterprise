import { createSynthesisNode } from './synthesis.node';
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

const validSynthesisJson = JSON.stringify({
  executiveSummary: 'Executive summary of legal analysis',
  keyFindings: [
    { specialist: 'contract', finding: 'NDA is one-sided', severity: 'medium' },
  ],
  overallRisk: {
    level: 'medium',
    description: 'Moderate risk identified',
    factors: ['One-sided agreement'],
  },
  crossInsights: [
    {
      insight: 'IP and contract overlap',
      relatedSpecialists: ['contract', 'ip'],
    },
  ],
  recommendations: ['Negotiate mutual terms', 'Add IP clause'],
  confidence: 0.85,
});

function createMockLLMClient(
  responseText = validSynthesisJson,
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
    userMessage: 'analyze this contract',
    documents: [{ name: 'contract.pdf', content: 'contract content' }],
    documentsMetadata: [],
    routingDecision: {
      specialist: 'contract',
      specialists: ['contract', 'ip'],
      confidence: 0.9,
      reasoning: 'test',
      categories: [],
      multiAgent: true,
    },
    orchestration: {
      specialists: ['contract', 'ip'],
      completed: ['contract', 'ip'],
    },
    specialistOutputs: {
      contract: {
        clauses: {},
        riskFlags: [],
        contractType: { type: 'nda', isMutual: true },
        confidence: 0.9,
        summary: 'NDA analyzed',
      },
      ip: {
        ownership: {
          owner: 'Company A',
          ownershipType: 'exclusive',
          clear: true,
          details: 'clear',
        },
        ipTypes: [],
        riskFlags: [],
        confidence: 0.85,
        summary: 'IP analyzed',
      },
    },
    response: undefined,
    status: 'processing',
    error: undefined,
    startedAt: Date.now(),
    outputMode: 'analysis',
    clauseMap: undefined,
    redlineOutput: undefined,
    completedAt: undefined,
    messages: [],
    ...overrides,
  };
}

describe('createSynthesisNode', () => {
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;
  let synthesisNode: ReturnType<typeof createSynthesisNode>;

  beforeEach(() => {
    mockLLMClient = createMockLLMClient();
    mockObservability = createMockObservability();
    synthesisNode = createSynthesisNode(mockLLMClient, mockObservability);
  });

  describe('basic functionality', () => {
    it('should return a function', () => {
      expect(typeof synthesisNode).toBe('function');
    });

    it('should call LLM with synthesis prompt', async () => {
      const state = createBaseState();
      await synthesisNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          context: mockCtx,
          callerName: 'legal-department:synthesis',
          temperature: 0.4,
        }),
      );
    });

    it('should return synthesis in orchestration', async () => {
      const state = createBaseState();
      const result = await synthesisNode(state);
      expect(result.orchestration?.synthesis).toBeDefined();
      expect(result.orchestration?.synthesis?.executiveSummary).toBeDefined();
    });

    it('should emit progress events', async () => {
      const state = createBaseState();
      await synthesisNode(state);
      expect(mockObservability.emitProgress).toHaveBeenCalled();
    });
  });

  describe('empty specialist outputs', () => {
    it('should return failed status when no specialist outputs', async () => {
      const state = createBaseState({ specialistOutputs: {} });
      const result = await synthesisNode(state);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('No specialist outputs');
    });
  });

  describe('JSON parsing', () => {
    it('should parse valid synthesis JSON', async () => {
      const state = createBaseState();
      const result = await synthesisNode(state);
      expect(result.orchestration?.synthesis?.executiveSummary).toBe(
        'Executive summary of legal analysis',
      );
      expect(result.orchestration?.synthesis?.recommendations).toHaveLength(2);
    });

    it('should handle markdown code blocks', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: '```json\n' + validSynthesisJson + '\n```',
      });
      const state = createBaseState();
      const result = await synthesisNode(state);
      expect(result.orchestration?.synthesis).toBeDefined();
    });

    it('should handle plain code blocks', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: '```\n' + validSynthesisJson + '\n```',
      });
      const state = createBaseState();
      const result = await synthesisNode(state);
      expect(result.orchestration?.synthesis).toBeDefined();
    });

    it('should return failed status when LLM returns unparseable JSON', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: 'Not valid JSON synthesis output',
      });
      const state = createBaseState();
      const result = await synthesisNode(state);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Failed to parse LLM response');
    });
  });

  describe('user message in synthesis prompt', () => {
    it('should include all specialist outputs in prompt', async () => {
      const state = createBaseState();
      await synthesisNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: expect.stringContaining('CONTRACT SPECIALIST ANALYSIS'),
        }),
      );
    });

    it('should include document name in prompt', async () => {
      const state = createBaseState();
      await synthesisNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: expect.stringContaining('contract.pdf'),
        }),
      );
    });

    it('should include document type when legalMetadata present', async () => {
      const state = createBaseState({
        documentsMetadata: [
          {
            documentType: { type: 'NDA', confidence: 0.9 },
            sections: {
              sections: [],
              confidence: 0.5,
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
        ],
      });
      await synthesisNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: expect.stringContaining('NDA'),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should return failed status when LLM throws', async () => {
      mockLLMClient.callLLM.mockRejectedValue(new Error('LLM unavailable'));
      const state = createBaseState();
      const result = await synthesisNode(state);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Synthesis:');
    });

    it('should emit failure event on error', async () => {
      mockLLMClient.callLLM.mockRejectedValue(new Error('LLM timeout'));
      const state = createBaseState();
      await synthesisNode(state);
      expect(mockObservability.emitFailed).toHaveBeenCalled();
    });
  });
});
