import { createIpAgentNode } from './ip-agent.node';
import { LegalDepartmentState } from '../legal-department.state';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../shared/services/observability.service';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

const mockCtx: ExecutionContext = {
  orgSlug: 'test-org',
  userId: 'test-user',
  conversationId: 'conv-123',
  taskId: 'task-123',
  planId: 'plan-123',
  deliverableId: 'deliverable-123',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
};

const validIpJson = JSON.stringify({
  ownership: {
    owner: 'Company A',
    ownershipType: 'exclusive',
    workForHire: { isWorkForHire: true, details: 'all work for hire' },
    clear: true,
    details: 'clear ownership',
  },
  licensing: {
    licenseType: 'perpetual',
    scope: 'limited field of use',
    exclusive: false,
    details: 'limited license',
  },
  ipTypes: [{ type: 'copyright', description: 'software code' }],
  warranties: {
    nonInfringement: true,
    authority: true,
    details: 'full warranties',
  },
  riskFlags: [],
  confidence: 0.9,
  summary: 'IP ownership is clear with work-for-hire provisions.',
});

function createMockLLMClient(
  responseText = validIpJson,
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
    userMessage: 'Analyze IP rights',
    documents: [
      {
        name: 'ip-agreement.pdf',
        content: 'intellectual property license agreement content',
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

describe('createIpAgentNode', () => {
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;
  let ipAgentNode: ReturnType<typeof createIpAgentNode>;

  beforeEach(() => {
    mockLLMClient = createMockLLMClient();
    mockObservability = createMockObservability();
    ipAgentNode = createIpAgentNode(mockLLMClient, mockObservability);
  });

  it('should return a function', () => {
    expect(typeof ipAgentNode).toBe('function');
  });

  it('should return analysis in specialistOutputs.ip', async () => {
    const result = await ipAgentNode(createBaseState());
    expect(result.specialistOutputs?.ip).toBeDefined();
    expect(result.specialistOutputs?.ip?.ownership).toBeDefined();
  });

  it('should return failed when no document content', async () => {
    const result = await ipAgentNode(
      createBaseState({ documents: [], legalMetadata: undefined }),
    );
    expect(result.status).toBe('failed');
  });

  it('should handle markdown code block responses', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '```json\n' + validIpJson + '\n```',
    });
    const result = await ipAgentNode(createBaseState());
    expect(result.specialistOutputs?.ip).toBeDefined();
  });

  it('should handle plain code block responses', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: '```\n' + validIpJson + '\n```',
    });
    const result = await ipAgentNode(createBaseState());
    expect(result.specialistOutputs?.ip).toBeDefined();
  });

  it('should create fallback analysis when JSON parsing fails', async () => {
    mockLLMClient.callLLM.mockResolvedValue({ text: 'not valid json' });
    const result = await ipAgentNode(createBaseState());
    expect(result.specialistOutputs?.ip?.riskFlags).toContainEqual(
      expect.objectContaining({ flag: 'analysis-incomplete' }),
    );
  });

  it('should flag unclear IP ownership', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify({
        ownership: {
          owner: 'unknown',
          ownershipType: 'unclear',
          clear: false,
          details: 'unclear',
        },
        ipTypes: [],
        riskFlags: [],
        confidence: 0.5,
        summary: 'Unclear ownership',
      }),
    });
    const result = await ipAgentNode(createBaseState());
    expect(result.specialistOutputs?.ip?.riskFlags).toContainEqual(
      expect.objectContaining({ flag: 'unclear-ip-ownership' }),
    );
  });

  it('should flag no work-for-hire when relevant IP types exist', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify({
        ownership: {
          owner: 'Company A',
          ownershipType: 'exclusive',
          workForHire: { isWorkForHire: false, details: 'no work for hire' },
          clear: true,
          details: 'clear',
        },
        ipTypes: [{ type: 'copyright', description: 'code' }],
        riskFlags: [],
        confidence: 0.8,
        summary: 'IP analyzed',
      }),
    });
    const result = await ipAgentNode(createBaseState());
    expect(result.specialistOutputs?.ip?.riskFlags).toContainEqual(
      expect.objectContaining({ flag: 'no-work-for-hire' }),
    );
  });

  it('should flag missing non-infringement warranty', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify({
        ownership: {
          owner: 'Company A',
          ownershipType: 'exclusive',
          clear: true,
          details: 'clear',
        },
        ipTypes: [],
        warranties: {
          nonInfringement: false,
          authority: true,
          details: 'no warranty',
        },
        riskFlags: [],
        confidence: 0.8,
        summary: 'No warranty',
      }),
    });
    const result = await ipAgentNode(createBaseState());
    expect(result.specialistOutputs?.ip?.riskFlags).toContainEqual(
      expect.objectContaining({ flag: 'no-non-infringement-warranty' }),
    );
  });

  it('should flag overly broad license scope', async () => {
    mockLLMClient.callLLM.mockResolvedValue({
      text: JSON.stringify({
        ownership: {
          owner: 'Company A',
          ownershipType: 'exclusive',
          clear: true,
          details: 'clear',
        },
        licensing: {
          licenseType: 'perpetual',
          scope: 'all uses unlimited worldwide',
          exclusive: false,
          details: 'very broad',
        },
        ipTypes: [],
        riskFlags: [],
        confidence: 0.8,
        summary: 'Broad license',
      }),
    });
    const result = await ipAgentNode(createBaseState());
    expect(result.specialistOutputs?.ip?.riskFlags).toContainEqual(
      expect.objectContaining({ flag: 'broad-license-scope' }),
    );
  });

  it('should include metadata context when available', async () => {
    const state = createBaseState({
      legalMetadata: {
        documentType: { type: 'ip assignment', confidence: 0.9 },
        sections: { sections: [], confidence: 0.5, structureType: 'formal' },
        signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
        dates: { dates: [], confidence: 0.5 },
        parties: {
          parties: [],
          contractingParties: [
            {
              name: 'Inventor Co',
              type: 'corporate',
              position: 0,
              confidence: 0.9,
            },
            {
              name: 'Assignee Corp',
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
    await ipAgentNode(state);
    expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.stringContaining('Inventor Co'),
      }),
    );
  });

  it('should return failed on LLM error', async () => {
    mockLLMClient.callLLM.mockRejectedValue(new Error('LLM error'));
    const result = await ipAgentNode(createBaseState());
    expect(result.status).toBe('failed');
    expect(result.error).toContain('IP Agent:');
  });

  it('should use metadata sections when no documents', async () => {
    const state = createBaseState({
      documents: [],
      legalMetadata: {
        documentType: { type: 'ip', confidence: 0.9 },
        sections: {
          sections: [
            {
              title: 'IP Rights',
              type: 'ip',
              startIndex: 0,
              endIndex: 100,
              content: 'ip license content',
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
    const result = await ipAgentNode(state);
    expect(result.specialistOutputs?.ip).toBeDefined();
  });

  it('should emit progress events', async () => {
    await ipAgentNode(createBaseState());
    expect(mockObservability.emitProgress).toHaveBeenCalledTimes(2);
  });
});
