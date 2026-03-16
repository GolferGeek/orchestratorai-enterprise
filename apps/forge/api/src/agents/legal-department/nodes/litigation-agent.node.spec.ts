import { createLitigationAgentNode } from './litigation-agent.node';
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

const validLitigationJson = JSON.stringify({
  caseInfo: {
    caption: 'Smith v. Jones',
    court: 'SDNY',
    caseNumber: '24-cv-1234',
    filingDate: '2024-01-15',
    details: 'Federal case',
  },
  parties: {
    plaintiffs: ['Smith Inc'],
    defendants: ['Jones Corp'],
    otherParties: [],
  },
  claims: [
    { claim: 'Breach of Contract', description: 'Failed to deliver services' },
  ],
  reliefSought: { monetary: '$500,000', details: 'Contract damages' },
  deadlines: [
    {
      deadline: 'Answer Due',
      description: 'Respond to complaint',
      calculatedDate: '2024-02-05',
      daysRemaining: 30,
      rule: 'FRCP 12(a)',
    },
  ],
  riskAssessment: { overallRisk: 'medium', details: 'Contract dispute' },
  riskFlags: [],
  confidence: 0.85,
  summary: 'Breach of contract complaint analyzed.',
});

function createMockLLMClient(
  responseText = validLitigationJson,
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
    userMessage: 'Analyze complaint',
    documents: [
      {
        name: 'complaint.pdf',
        content: 'civil complaint for breach of contract',
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

describe('createLitigationAgentNode', () => {
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;
  let litigationAgentNode: ReturnType<typeof createLitigationAgentNode>;

  beforeEach(() => {
    mockLLMClient = createMockLLMClient();
    mockObservability = createMockObservability();
    litigationAgentNode = createLitigationAgentNode(
      mockLLMClient,
      mockObservability,
    );
  });

  it('should return a function', () => {
    expect(typeof litigationAgentNode).toBe('function');
  });

  it('should return analysis in specialistOutputs.litigation', async () => {
    const result = await litigationAgentNode(createBaseState());
    expect(result.specialistOutputs?.litigation).toBeDefined();
    expect(result.specialistOutputs?.litigation?.caseInfo).toBeDefined();
  });

  it('should return failed when no document content', async () => {
    const result = await litigationAgentNode(
      createBaseState({ documents: [], legalMetadata: undefined }),
    );
    expect(result.status).toBe('failed');
    expect(result.error).toContain('No document content');
  });

  it('should handle markdown code block responses', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '```json\n' + validLitigationJson + '\n```',
    });
    const result = await litigationAgentNode(createBaseState());
    expect(result.specialistOutputs?.litigation).toBeDefined();
  });

  it('should handle plain code block responses', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '```\n' + validLitigationJson + '\n```',
    });
    const result = await litigationAgentNode(createBaseState());
    expect(result.specialistOutputs?.litigation).toBeDefined();
  });

  it('should create fallback analysis when JSON parsing fails', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'not valid json' });
    const result = await litigationAgentNode(createBaseState());
    expect(result.specialistOutputs?.litigation?.riskFlags).toContainEqual(
      expect.objectContaining({ flag: 'analysis-incomplete' }),
    );
  });

  describe('playbook rules', () => {
    it('should flag urgent deadlines (< 7 days)', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          caseInfo: { details: 'case info' },
          parties: { plaintiffs: ['Smith'], defendants: ['Jones'] },
          claims: [],
          deadlines: [
            {
              deadline: 'Answer Due',
              description: 'Respond',
              calculatedDate: '2024-01-22',
              daysRemaining: 2,
              rule: 'FRCP 12(a)',
            },
          ],
          riskFlags: [],
          confidence: 0.8,
          summary: 'Urgent deadline',
        }),
      });
      const result = await litigationAgentNode(createBaseState());
      expect(result.specialistOutputs?.litigation?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'urgent-deadline' }),
      );
    });

    it('should use critical severity for deadline <= 3 days', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          caseInfo: { details: 'case info' },
          parties: { plaintiffs: ['Smith'], defendants: ['Jones'] },
          claims: [],
          deadlines: [
            {
              deadline: 'Filing Due',
              description: 'File motion',
              daysRemaining: 1,
              rule: 'FRCP',
            },
          ],
          riskFlags: [],
          confidence: 0.8,
          summary: 'Critical deadline',
        }),
      });
      const result = await litigationAgentNode(createBaseState());
      const urgentFlag = result.specialistOutputs?.litigation?.riskFlags?.find(
        (f) => f.flag === 'urgent-deadline',
      );
      expect(urgentFlag?.severity).toBe('critical');
    });

    it('should use high severity for deadline 4-5 days', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          caseInfo: { details: 'case info' },
          parties: { plaintiffs: ['Smith'], defendants: ['Jones'] },
          claims: [],
          deadlines: [
            {
              deadline: 'Filing Due',
              description: 'File motion',
              daysRemaining: 5,
              rule: 'FRCP',
            },
          ],
          riskFlags: [],
          confidence: 0.8,
          summary: 'High priority deadline',
        }),
      });
      const result = await litigationAgentNode(createBaseState());
      const urgentFlag = result.specialistOutputs?.litigation?.riskFlags?.find(
        (f) => f.flag === 'urgent-deadline',
      );
      expect(urgentFlag?.severity).toBe('high');
    });

    it('should flag missing answer deadline for complaint', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          caseInfo: { details: 'case info' },
          parties: { plaintiffs: ['Smith'], defendants: ['Jones'] },
          claims: [{ claim: 'Breach', description: 'breach of contract' }],
          deadlines: [],
          riskFlags: [],
          confidence: 0.8,
          summary: 'No answer deadline',
        }),
      });
      const state = createBaseState({
        documents: [
          {
            name: 'complaint.pdf',
            content: 'this is a complaint with summons attached',
          },
        ],
      });
      const result = await litigationAgentNode(state);
      expect(result.specialistOutputs?.litigation?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'missing-answer-deadline' }),
      );
    });

    it('should flag high-risk cases', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          caseInfo: { details: 'case info' },
          parties: { plaintiffs: ['Smith'], defendants: ['Jones'] },
          claims: [],
          deadlines: [],
          riskAssessment: { overallRisk: 'high', details: 'High exposure' },
          riskFlags: [],
          confidence: 0.8,
          summary: 'High risk case',
        }),
      });
      const result = await litigationAgentNode(createBaseState());
      expect(result.specialistOutputs?.litigation?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'high-risk-case' }),
      );
    });

    it('should flag critical-risk cases', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          caseInfo: { details: 'case info' },
          parties: { plaintiffs: ['Smith'], defendants: ['Jones'] },
          claims: [],
          deadlines: [],
          riskAssessment: {
            overallRisk: 'critical',
            details: 'Critical exposure',
          },
          riskFlags: [],
          confidence: 0.8,
          summary: 'Critical risk case',
        }),
      });
      const result = await litigationAgentNode(createBaseState());
      expect(result.specialistOutputs?.litigation?.riskFlags).toContainEqual(
        expect.objectContaining({
          flag: 'high-risk-case',
          severity: 'critical',
        }),
      );
    });
  });

  it('should include primary date from metadata in user message', async () => {
    const state = createBaseState({
      legalMetadata: {
        documentType: { type: 'pleading', confidence: 0.9 },
        sections: { sections: [], confidence: 0.5, structureType: 'formal' },
        signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
        dates: {
          dates: [],
          primaryDate: {
            originalText: 'Jan 15, 2024',
            normalizedDate: '2024-01-15',
            dateType: 'filing_date',
            confidence: 0.9,
            position: 0,
          },
          confidence: 0.9,
        },
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
    await litigationAgentNode(state);
    expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.stringContaining('2024-01-15'),
      }),
    );
  });

  it('should return failed on LLM error', async () => {
    mockLLMClient.callLLM.mockRejectedValue(new Error('LLM error'));
    const result = await litigationAgentNode(createBaseState());
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Litigation Agent:');
  });

  it('should use metadata sections when no documents', async () => {
    const state = createBaseState({
      documents: [],
      legalMetadata: {
        documentType: { type: 'complaint', confidence: 0.9 },
        sections: {
          sections: [
            {
              title: 'Complaint',
              type: 'complaint',
              startIndex: 0,
              endIndex: 100,
              content: 'civil complaint content',
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
    const result = await litigationAgentNode(state);
    expect(result.specialistOutputs?.litigation).toBeDefined();
  });

  it('should emit progress events', async () => {
    await litigationAgentNode(createBaseState());
    expect(mockObservability.emitProgress).toHaveBeenCalledTimes(2);
  });
});
