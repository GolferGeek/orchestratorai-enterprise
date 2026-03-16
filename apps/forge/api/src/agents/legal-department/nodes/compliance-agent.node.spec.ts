import { createComplianceAgentNode } from './compliance-agent.node';
import { LegalDepartmentState } from '../legal-department.state';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../shared/services/observability.service';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

const mockCtx: ExecutionContext = {
  orgSlug: 'test-org',
  userId: 'test-user',
  conversationId: 'conv-123',
  conversationId: 'conv-123',
  planId: 'plan-123',
  deliverableId: 'deliverable-123',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
};

const validComplianceJson = JSON.stringify({
  policyChecks: {
    termLimit: {
      contractTerm: '3 years',
      maxAllowedTerm: '5 years',
      compliant: true,
      details: 'Within limits',
    },
    jurisdiction: {
      contractJurisdiction: 'Delaware',
      allowedJurisdictions: ['Delaware'],
      compliant: true,
      details: 'US jurisdiction',
    },
  },
  regulatoryCompliance: {
    regulations: ['GDPR'],
    status: 'compliant',
    details: 'Compliant with GDPR',
  },
  riskFlags: [],
  confidence: 0.85,
  summary: 'Document is policy compliant.',
});

function createMockLLMClient(
  responseText = validComplianceJson,
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
    userMessage: 'Check compliance',
    documents: [
      { name: 'contract.pdf', content: 'compliance document content' },
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

describe('createComplianceAgentNode', () => {
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;
  let complianceAgentNode: ReturnType<typeof createComplianceAgentNode>;

  beforeEach(() => {
    mockLLMClient = createMockLLMClient();
    mockObservability = createMockObservability();
    complianceAgentNode = createComplianceAgentNode(
      mockLLMClient,
      mockObservability,
    );
  });

  it('should return a function', () => {
    expect(typeof complianceAgentNode).toBe('function');
  });

  it('should call LLM and return analysis in specialistOutputs.compliance', async () => {
    const state = createBaseState();
    const result = await complianceAgentNode(state);
    expect(result.specialistOutputs?.compliance).toBeDefined();
    expect(result.specialistOutputs?.compliance?.summary).toBeDefined();
  });

  it('should return failed when no document content', async () => {
    const state = createBaseState({ documents: [], legalMetadata: undefined });
    const result = await complianceAgentNode(state);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('No document content');
  });

  it('should handle markdown code block responses', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '```json\n' + validComplianceJson + '\n```',
    });
    const result = await complianceAgentNode(createBaseState());
    expect(result.specialistOutputs?.compliance).toBeDefined();
  });

  it('should create fallback analysis when JSON parsing fails', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'invalid json' });
    const result = await complianceAgentNode(createBaseState());
    expect(result.specialistOutputs?.compliance?.riskFlags).toContainEqual(
      expect.objectContaining({ flag: 'analysis-incomplete' }),
    );
  });

  it('should flag term > 5 years', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify({
        policyChecks: {
          termLimit: {
            contractTerm: '7 years',
            maxAllowedTerm: '5 years',
            compliant: false,
            details: 'Exceeds limit',
          },
        },
        regulatoryCompliance: {
          regulations: [],
          status: 'not-applicable',
          details: 'N/A',
        },
        riskFlags: [],
        confidence: 0.8,
        summary: 'Long term contract',
      }),
    });
    const result = await complianceAgentNode(createBaseState());
    expect(result.specialistOutputs?.compliance?.riskFlags).toContainEqual(
      expect.objectContaining({ flag: 'term-limit-exceeded' }),
    );
  });

  it('should flag perpetual term', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify({
        policyChecks: {
          termLimit: {
            contractTerm: 'perpetual',
            maxAllowedTerm: '5 years',
            compliant: false,
            details: 'Perpetual',
          },
        },
        regulatoryCompliance: {
          regulations: [],
          status: 'not-applicable',
          details: 'N/A',
        },
        riskFlags: [],
        confidence: 0.8,
        summary: 'Perpetual contract',
      }),
    });
    const result = await complianceAgentNode(createBaseState());
    expect(result.specialistOutputs?.compliance?.riskFlags).toContainEqual(
      expect.objectContaining({ flag: 'perpetual-term-violation' }),
    );
  });

  it('should flag non-US jurisdiction', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify({
        policyChecks: {
          jurisdiction: {
            contractJurisdiction: 'England and Wales',
            allowedJurisdictions: ['Delaware'],
            compliant: false,
            details: 'Non-US',
          },
        },
        regulatoryCompliance: {
          regulations: [],
          status: 'not-applicable',
          details: 'N/A',
        },
        riskFlags: [],
        confidence: 0.8,
        summary: 'Non-US jurisdiction',
      }),
    });
    const result = await complianceAgentNode(createBaseState());
    expect(result.specialistOutputs?.compliance?.riskFlags).toContainEqual(
      expect.objectContaining({ flag: 'non-us-jurisdiction' }),
    );
  });

  it('should flag missing jurisdiction', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify({
        policyChecks: {},
        regulatoryCompliance: {
          regulations: [],
          status: 'not-applicable',
          details: 'N/A',
        },
        riskFlags: [],
        confidence: 0.8,
        summary: 'No jurisdiction specified',
      }),
    });
    const result = await complianceAgentNode(createBaseState());
    expect(result.specialistOutputs?.compliance?.riskFlags).toContainEqual(
      expect.objectContaining({ flag: 'no-jurisdiction-specified' }),
    );
  });

  it('should include metadata context when available', async () => {
    const state = createBaseState({
      legalMetadata: {
        documentType: { type: 'compliance', confidence: 0.9 },
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
              name: 'Company A',
              type: 'corporate',
              position: 0,
              confidence: 0.9,
            },
            {
              name: 'Company B',
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
    await complianceAgentNode(state);
    expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.stringContaining('Company A'),
      }),
    );
  });

  it('should return failed on LLM error', async () => {
    mockLLMClient.callLLM.mockRejectedValue(new Error('LLM error'));
    const result = await complianceAgentNode(createBaseState());
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Compliance Agent:');
  });

  it('should use metadata sections when no documents', async () => {
    const state = createBaseState({
      documents: [],
      legalMetadata: {
        documentType: { type: 'policy', confidence: 0.9 },
        sections: {
          sections: [
            {
              title: 'Policy',
              type: 'policy',
              startIndex: 0,
              endIndex: 100,
              content: 'compliance policy text',
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
    const result = await complianceAgentNode(state);
    expect(result.specialistOutputs?.compliance).toBeDefined();
  });

  it("should include user message when not just 'analyze'", async () => {
    const state = createBaseState({ userMessage: 'Check GDPR compliance' });
    await complianceAgentNode(state);
    expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.stringContaining('Check GDPR compliance'),
      }),
    );
  });
});
