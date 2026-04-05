import { createEchoNode } from './echo.node';
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

function createMockLLMClient(): jest.Mocked<LLMHttpClientService> {
  return {
    callLLM: jest.fn().mockResolvedValue({ text: 'LLM response text' }),
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
    userMessage: 'What does this contract mean?',
    documents: [],
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

describe('createEchoNode', () => {
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;
  let mockObservability: jest.Mocked<ObservabilityService>;
  let echoNode: ReturnType<typeof createEchoNode>;

  beforeEach(() => {
    mockLLMClient = createMockLLMClient();
    mockObservability = createMockObservability();
    echoNode = createEchoNode(mockLLMClient, mockObservability);
  });

  describe('basic functionality', () => {
    it('should return a function', () => {
      expect(typeof echoNode).toBe('function');
    });

    it('should call LLM with user message', async () => {
      const state = createBaseState({ userMessage: 'What are the key terms?' });
      await echoNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: 'What are the key terms?',
          context: mockCtx,
        }),
      );
    });

    it('should emit progress events', async () => {
      const state = createBaseState();
      await echoNode(state);
      expect(mockObservability.emitProgress).toHaveBeenCalled();
    });

    it('should return completed status on success', async () => {
      const state = createBaseState();
      const result = await echoNode(state);
      expect(result.status).toBe('completed');
    });

    it('should return response from LLM', async () => {
      const state = createBaseState();
      const result = await echoNode(state);
      expect(result.response).toContain('LLM response text');
    });
  });

  describe('without legal metadata', () => {
    it('should use general legal guidance prompt when no metadata', async () => {
      const state = createBaseState({ legalMetadata: undefined });
      await echoNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          systemMessage: expect.stringContaining('general legal information'),
        }),
      );
    });

    it('should not append summary when no metadata', async () => {
      const state = createBaseState({ legalMetadata: undefined });
      const result = await echoNode(state);
      expect(result.response).toBe('LLM response text');
    });
  });

  describe('with legal metadata', () => {
    const fullMetadata = {
      documentType: {
        type: 'NDA',
        confidence: 0.95,
        alternatives: [{ type: 'contract', confidence: 0.7 }],
      },
      sections: {
        sections: [
          {
            title: 'Definitions',
            type: 'definitions',
            startIndex: 0,
            endIndex: 100,
            content: 'section content',
            confidence: 0.9,
          },
          {
            title: 'Obligations',
            type: 'obligations',
            startIndex: 100,
            endIndex: 200,
            content: 'obligations content',
            confidence: 0.9,
          },
          {
            title: 'Term',
            type: 'term',
            startIndex: 200,
            endIndex: 300,
            content: 'term content',
            confidence: 0.9,
          },
          {
            title: 'Termination',
            type: 'termination',
            startIndex: 300,
            endIndex: 400,
            content: 'termination content',
            confidence: 0.8,
          },
          {
            title: 'Governing Law',
            type: 'governing_law',
            startIndex: 400,
            endIndex: 500,
            content: 'governing law content',
            confidence: 0.85,
          },
          {
            title: 'Miscellaneous',
            type: 'misc',
            startIndex: 500,
            endIndex: 600,
            content: 'misc content',
            confidence: 0.7,
          },
        ],
        confidence: 0.9,
        structureType: 'formal' as const,
      },
      signatures: {
        signatures: [
          {
            partyName: 'Company A',
            signerName: 'John Doe',
            signerTitle: 'CEO',
            signatureDate: '2024-01-01',
            startIndex: 600,
            endIndex: 650,
            content: 'signature block',
            confidence: 0.9,
            detectionMethod: 'keyword' as const,
          },
        ],
        confidence: 0.9,
        partyCount: 2,
      },
      dates: {
        dates: [
          {
            originalText: 'January 1, 2024',
            normalizedDate: '2024-01-01',
            dateType: 'effective_date',
            confidence: 0.9,
            position: 10,
          },
          {
            originalText: 'December 31, 2024',
            normalizedDate: '2024-12-31',
            dateType: 'expiry_date',
            confidence: 0.85,
            position: 50,
          },
          {
            originalText: 'June 1, 2024',
            normalizedDate: '2024-06-01',
            dateType: 'notice_date',
            confidence: 0.8,
            position: 80,
          },
          {
            originalText: 'March 15, 2024',
            normalizedDate: '2024-03-15',
            dateType: 'amendment_date',
            confidence: 0.75,
            position: 100,
          },
          {
            originalText: 'September 30, 2024',
            normalizedDate: '2024-09-30',
            dateType: 'review_date',
            confidence: 0.7,
            position: 120,
          },
        ],
        primaryDate: {
          originalText: 'January 1, 2024',
          normalizedDate: '2024-01-01',
          dateType: 'effective_date',
          confidence: 0.9,
          position: 10,
        },
        confidence: 0.9,
      },
      parties: {
        parties: [
          {
            name: 'Company A',
            type: 'corporate',
            role: 'Discloser',
            position: 0,
            confidence: 0.95,
          },
          {
            name: 'Company B',
            type: 'corporate',
            role: 'Recipient',
            position: 50,
            confidence: 0.9,
          },
        ],
        contractingParties: [
          {
            name: 'Company A',
            type: 'corporate',
            role: 'Discloser',
            position: 0,
            confidence: 0.95,
          },
          {
            name: 'Company B',
            type: 'corporate',
            role: 'Recipient',
            position: 50,
            confidence: 0.9,
          },
        ] as [
          {
            name: string;
            type: string;
            role?: string;
            position: number;
            confidence: number;
          },
          {
            name: string;
            type: string;
            role?: string;
            position: number;
            confidence: number;
          },
        ],
        confidence: 0.9,
      },
      confidence: {
        overall: 0.9,
        breakdown: {
          documentType: 0.95,
          sections: 0.9,
          signatures: 0.9,
          dates: 0.9,
          parties: 0.9,
        },
        factors: {
          textQuality: 0.9,
          extractionMethod: 'native' as const,
          completeness: 0.9,
          patternMatchCount: 10,
        },
      },
      extractedAt: new Date().toISOString(),
    };

    it('should use document metadata context in system prompt', async () => {
      const state = createBaseState({ legalMetadata: fullMetadata });
      await echoNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          systemMessage: expect.stringContaining('NDA'),
        }),
      );
    });

    it('should append quick summary to response when metadata present', async () => {
      const state = createBaseState({ legalMetadata: fullMetadata });
      const result = await echoNode(state);
      expect(result.response).toContain('Document Analysis Summary');
      expect(result.response).toContain('LLM response text');
    });

    it('should include legalMetadata in returned state', async () => {
      const state = createBaseState({ legalMetadata: fullMetadata });
      const result = await echoNode(state);
      expect(result.legalMetadata).toBeDefined();
    });

    it('should format sections in metadata summary', async () => {
      const state = createBaseState({ legalMetadata: fullMetadata });
      await echoNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          systemMessage: expect.stringContaining('Sections Detected'),
        }),
      );
    });

    it('should format parties in metadata summary', async () => {
      const state = createBaseState({ legalMetadata: fullMetadata });
      await echoNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          systemMessage: expect.stringContaining('Parties Identified'),
        }),
      );
    });

    it('should format signatures in metadata summary', async () => {
      const state = createBaseState({ legalMetadata: fullMetadata });
      await echoNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          systemMessage: expect.stringContaining('Signatures Detected'),
        }),
      );
    });

    it('should format dates in metadata summary', async () => {
      const state = createBaseState({ legalMetadata: fullMetadata });
      await echoNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          systemMessage: expect.stringContaining('Dates Extracted'),
        }),
      );
    });

    it('should handle more than 5 sections (show truncation message)', async () => {
      const state = createBaseState({ legalMetadata: fullMetadata });
      await echoNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          systemMessage: expect.stringContaining('more sections'),
        }),
      );
    });

    it('should handle more than 4 dates (show truncation message)', async () => {
      const state = createBaseState({ legalMetadata: fullMetadata });
      await echoNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          systemMessage: expect.stringContaining('more dates'),
        }),
      );
    });

    it('should show alternative document types when present', async () => {
      const state = createBaseState({ legalMetadata: fullMetadata });
      await echoNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          systemMessage: expect.stringContaining('Alternative types'),
        }),
      );
    });

    it('should use contracting parties display when available', async () => {
      const state = createBaseState({ legalMetadata: fullMetadata });
      await echoNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          systemMessage: expect.stringContaining('Company A'),
        }),
      );
    });
  });

  describe('with metadata but no contracting parties', () => {
    it('should list individual parties when no contractingParties', async () => {
      const metadataWithoutContractingParties = {
        documentType: { type: 'NDA', confidence: 0.9 },
        sections: {
          sections: [],
          confidence: 0.5,
          structureType: 'unstructured' as const,
        },
        signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
        dates: { dates: [], confidence: 0.5 },
        parties: {
          parties: [
            {
              name: 'Company X',
              type: 'corporate',
              position: 0,
              confidence: 0.9,
            },
            {
              name: 'Company Y',
              type: 'corporate',
              position: 50,
              confidence: 0.85,
            },
            {
              name: 'Company Z',
              type: 'corporate',
              position: 100,
              confidence: 0.8,
            },
            {
              name: 'Company W',
              type: 'corporate',
              position: 150,
              confidence: 0.75,
            },
          ],
          confidence: 0.85,
        },
        confidence: {
          overall: 0.85,
          breakdown: {},
          factors: {
            textQuality: 0.85,
            extractionMethod: 'native' as const,
            completeness: 0.85,
            patternMatchCount: 5,
          },
        },
        extractedAt: new Date().toISOString(),
      };
      const state = createBaseState({
        legalMetadata: metadataWithoutContractingParties,
      });
      await echoNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          systemMessage: expect.stringContaining('Company X'),
        }),
      );
    });
  });

  describe('LLM skip when documents + metadata present', () => {
    it('should not call LLM when documents and metadata are present', async () => {
      const state = createBaseState({
        documents: [{ name: 'contract.pdf', content: 'contract text' }],
        legalMetadata: {
          documentType: { type: 'contract', confidence: 0.9 },
          sections: {
            sections: [],
            confidence: 0.5,
            structureType: 'formal' as const,
          },
          signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
          dates: { dates: [], confidence: 0.5 },
          parties: { parties: [], confidence: 0.5 },
          confidence: {
            overall: 0.9,
            breakdown: {},
            factors: {
              textQuality: 0.9,
              extractionMethod: 'native' as const,
              completeness: 0.9,
              patternMatchCount: 5,
            },
          },
          extractedAt: new Date().toISOString(),
        },
      });
      const result = await echoNode(state);
      expect(mockLLMClient.callLLM).not.toHaveBeenCalled();
      expect(result.status).toBe('completed');
      expect(result.legalMetadata).toBeDefined();
    });

    it('should still call LLM when documents present but no metadata', async () => {
      const state = createBaseState({
        documents: [{ name: 'contract.pdf', content: 'contract text' }],
        legalMetadata: undefined,
      });
      await echoNode(state);
      expect(mockLLMClient.callLLM).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should return failed status when LLM throws', async () => {
      mockLLMClient.callLLM.mockRejectedValue(
        new Error('LLM service unavailable'),
      );
      const state = createBaseState();
      const result = await echoNode(state);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('LLM service unavailable');
    });

    it('should emit failure event on error', async () => {
      mockLLMClient.callLLM.mockRejectedValue(new Error('LLM timeout'));
      const state = createBaseState();
      await echoNode(state);
      expect(mockObservability.emitFailed).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      mockLLMClient.callLLM.mockRejectedValue('string error');
      const state = createBaseState();
      const result = await echoNode(state);
      expect(result.status).toBe('failed');
      expect(result.error).toBe('string error');
    });
  });
});
