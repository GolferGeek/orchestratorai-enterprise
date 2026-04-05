import { createCorporateAgentNode } from './corporate-agent.node';
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

const validCorporateJson = JSON.stringify({
  documentType: {
    type: 'resolution',
    purpose: 'Board approval',
    details: 'Board resolution',
  },
  governance: {
    action: 'Approve acquisition',
    quorum: { required: 'majority', met: true, details: 'Quorum met' },
    votingResults: { required: 'majority', actual: 'unanimous', passed: true },
    authority: ['Board of Directors'],
  },
  compliance: {
    filingDeadlines: [],
    requiredApprovals: ['CEO signature'],
    details: 'No immediate filing needed',
  },
  entityInfo: {
    entityName: 'Acme Corp',
    entityType: 'corporation',
    jurisdiction: 'Delaware',
    details: 'Delaware corporation',
  },
  riskFlags: [],
  confidence: 0.9,
  summary: 'Board resolution analyzed successfully.',
});

function createMockLLMClient(
  responseText = validCorporateJson,
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
    userMessage: 'Analyze board resolution',
    documents: [
      {
        name: 'resolution.pdf',
        content:
          'board of directors resolution content with shareholder approval',
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

describe('createCorporateAgentNode', () => {
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;
  let corporateAgentNode: ReturnType<typeof createCorporateAgentNode>;

  beforeEach(() => {
    mockLLMClient = createMockLLMClient();
    mockObservability = createMockObservability();
    corporateAgentNode = createCorporateAgentNode(
      mockLLMClient,
      mockObservability,
    );
  });

  it('should return a function', () => {
    expect(typeof corporateAgentNode).toBe('function');
  });

  it('should return analysis in specialistOutputs.corporate', async () => {
    const result = await corporateAgentNode(createBaseState());
    expect(result.specialistOutputs?.corporate).toBeDefined();
    expect(result.specialistOutputs?.corporate?.documentType).toBeDefined();
  });

  it('should return failed when no document content', async () => {
    const result = await corporateAgentNode(
      createBaseState({ documents: [], legalMetadata: undefined }),
    );
    expect(result.status).toBe('failed');
    expect(result.error).toContain('No document content');
  });

  it('should handle markdown code block responses', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '```json\n' + validCorporateJson + '\n```',
    });
    const result = await corporateAgentNode(createBaseState());
    expect(result.specialistOutputs?.corporate).toBeDefined();
  });

  it('should handle plain code block responses', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '```\n' + validCorporateJson + '\n```',
    });
    const result = await corporateAgentNode(createBaseState());
    expect(result.specialistOutputs?.corporate).toBeDefined();
  });

  it('should return failed status when LLM returns unparseable JSON', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'not valid json' });
    const result = await corporateAgentNode(createBaseState());
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Failed to parse LLM response');
  });

  describe('playbook rules', () => {
    it('should flag quorum not met', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          documentType: {
            type: 'minutes',
            purpose: 'Board meeting',
            details: 'Meeting minutes',
          },
          governance: {
            quorum: {
              required: 'majority',
              met: false,
              details: 'Quorum not met',
            },
          },
          riskFlags: [],
          confidence: 0.8,
          summary: 'Meeting quorum not met',
        }),
      });
      const result = await corporateAgentNode(createBaseState());
      expect(result.specialistOutputs?.corporate?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'quorum-not-met' }),
      );
    });

    it('should flag upcoming filing deadline', async () => {
      const nearFuture = new Date();
      nearFuture.setDate(nearFuture.getDate() + 15);
      const deadlineDate = nearFuture.toISOString().split('T')[0];

      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          documentType: {
            type: 'filing',
            purpose: 'Annual report',
            details: 'Annual filing',
          },
          compliance: {
            filingDeadlines: [
              {
                deadline: deadlineDate,
                requirement: 'Annual Report',
                status: 'upcoming',
              },
            ],
            details: 'Upcoming filing',
          },
          riskFlags: [],
          confidence: 0.8,
          summary: 'Upcoming filing',
        }),
      });
      const result = await corporateAgentNode(createBaseState());
      expect(result.specialistOutputs?.corporate?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'upcoming-filing-deadline' }),
      );
    });

    it('should flag overdue filing', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          documentType: {
            type: 'filing',
            purpose: 'Annual report',
            details: 'Annual filing',
          },
          compliance: {
            filingDeadlines: [
              {
                deadline: '2024-01-01',
                requirement: 'Annual Report',
                status: 'overdue',
              },
            ],
            details: 'Overdue filing',
          },
          riskFlags: [],
          confidence: 0.8,
          summary: 'Overdue filing',
        }),
      });
      const result = await corporateAgentNode(createBaseState());
      expect(result.specialistOutputs?.corporate?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'overdue-filing' }),
      );
    });

    it('should flag failed motion vote', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          documentType: {
            type: 'minutes',
            purpose: 'Board meeting',
            details: 'Meeting minutes',
          },
          governance: {
            votingResults: { required: '2/3', actual: '50%', passed: false },
          },
          riskFlags: [],
          confidence: 0.8,
          summary: 'Motion failed',
        }),
      });
      const result = await corporateAgentNode(createBaseState());
      expect(result.specialistOutputs?.corporate?.riskFlags).toContainEqual(
        expect.objectContaining({ flag: 'motion-failed' }),
      );
    });
  });

  it('should return failed on LLM error', async () => {
    mockLLMClient.callLLM.mockRejectedValue(new Error('LLM error'));
    const result = await corporateAgentNode(createBaseState());
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Corporate Agent:');
  });

  it('should use metadata sections when no documents', async () => {
    const state = createBaseState({
      documents: [],
      legalMetadata: {
        documentType: { type: 'resolution', confidence: 0.9 },
        sections: {
          sections: [
            {
              title: 'Resolution',
              type: 'resolution',
              startIndex: 0,
              endIndex: 100,
              content: 'board resolution content',
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
    const result = await corporateAgentNode(state);
    expect(result.specialistOutputs?.corporate).toBeDefined();
  });

  it('should emit progress events', async () => {
    await corporateAgentNode(createBaseState());
    expect(mockObservability.emitProgress).toHaveBeenCalledTimes(2);
  });

  it("should include user message when not just 'analyze'", async () => {
    const state = createBaseState({ userMessage: 'Check quorum requirements' });
    await corporateAgentNode(state);
    expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.stringContaining('Check quorum requirements'),
      }),
    );
  });
});
