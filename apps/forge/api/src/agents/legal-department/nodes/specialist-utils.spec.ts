import {
  getDocumentText,
  stripMarkdownFences,
  buildBaseUserMessage,
  queryCollectionForContext,
} from './specialist-utils';
import { LegalDepartmentState } from '../legal-department.state';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { RagStorageService } from '@orchestratorai/planes/rag';

const mockCtx: ExecutionContext = {
  orgSlug: 'test-org',
  userId: 'test-user',
  conversationId: 'conv-123',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
};

function createBaseState(
  overrides: Partial<LegalDepartmentState> = {},
): LegalDepartmentState {
  return {
    executionContext: mockCtx,
    userMessage: 'Analyze this contract',
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

describe('specialist-utils', () => {
  describe('getDocumentText', () => {
    it('should return content from documents array', () => {
      const state = createBaseState({
        documents: [{ name: 'doc.pdf', content: 'document content here' }],
      });
      expect(getDocumentText(state)).toBe('document content here');
    });

    it('should return content from legalMetadata sections when no documents', () => {
      const state = createBaseState({
        documents: [],
        legalMetadata: {
          documentType: { type: 'contract', confidence: 0.9 },
          sections: {
            sections: [
              {
                title: 'Section 1',
                type: 'terms',
                startIndex: 0,
                endIndex: 100,
                content: 'first section',
                confidence: 0.9,
              },
              {
                title: 'Section 2',
                type: 'obligations',
                startIndex: 100,
                endIndex: 200,
                content: 'second section',
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
      expect(getDocumentText(state)).toBe('first section\n\nsecond section');
    });

    it('should return undefined when neither documents nor metadata exists', () => {
      const state = createBaseState({
        documents: [],
        legalMetadata: undefined,
      });
      expect(getDocumentText(state)).toBeUndefined();
    });

    it('should prefer documents array over metadata sections', () => {
      const state = createBaseState({
        documents: [{ name: 'doc.pdf', content: 'from documents' }],
        legalMetadata: {
          documentType: { type: 'contract', confidence: 0.9 },
          sections: {
            sections: [
              {
                title: 'S1',
                type: 'terms',
                startIndex: 0,
                endIndex: 50,
                content: 'from metadata',
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
      expect(getDocumentText(state)).toBe('from documents');
    });
  });

  describe('stripMarkdownFences', () => {
    it('should remove ```json wrapper', () => {
      expect(stripMarkdownFences('```json\n{"key": "value"}\n```')).toBe(
        '{"key": "value"}',
      );
    });

    it('should remove ``` wrapper', () => {
      expect(stripMarkdownFences('```\n{"key": "value"}\n```')).toBe(
        '{"key": "value"}',
      );
    });

    it('should return trimmed text when no fences', () => {
      expect(stripMarkdownFences('  {"key": "value"}  ')).toBe(
        '{"key": "value"}',
      );
    });

    it('should handle empty string', () => {
      expect(stripMarkdownFences('')).toBe('');
    });
  });

  describe('buildBaseUserMessage', () => {
    it('should include document text', () => {
      const state = createBaseState({ userMessage: 'analyze' });
      const result = buildBaseUserMessage('contract text here', state);
      expect(result).toContain('contract text here');
    });

    it('should include metadata context when available', () => {
      const state = createBaseState({
        userMessage: 'analyze',
        legalMetadata: {
          documentType: { type: 'nda', confidence: 0.9 },
          sections: {
            sections: [],
            confidence: 0.5,
            structureType: 'formal',
          },
          signatures: { signatures: [], confidence: 0.5, partyCount: 0 },
          dates: { dates: [], confidence: 0.5 },
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
      const result = buildBaseUserMessage('doc text', state);
      expect(result).toContain('Document Type: nda');
      expect(result).toContain('Acme Corp');
      expect(result).toContain('Widget Inc');
    });

    it('should include user message when not just "analyze"', () => {
      const state = createBaseState({
        userMessage: 'Focus on confidentiality',
      });
      const result = buildBaseUserMessage('doc text', state);
      expect(result).toContain('User Request: Focus on confidentiality');
    });

    it('should not include user message when just "analyze"', () => {
      const state = createBaseState({ userMessage: 'analyze' });
      const result = buildBaseUserMessage('doc text', state);
      expect(result).not.toContain('User Request');
    });

    it('should include primary date when available', () => {
      const state = createBaseState({
        userMessage: 'analyze',
        legalMetadata: {
          documentType: { type: 'contract', confidence: 0.9 },
          sections: {
            sections: [],
            confidence: 0.5,
            structureType: 'formal',
          },
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
      const result = buildBaseUserMessage('doc text', state);
      expect(result).toContain('Primary Date: 2024-01-01');
    });
  });

  describe('queryCollectionForContext', () => {
    function createMockRagService(
      overrides: Partial<RagStorageService> = {},
    ): RagStorageService {
      return {
        getCollectionBySlug: jest
          .fn()
          .mockResolvedValue({ id: 'col-123', slug: 'test-collection' }),
        keywordSearch: jest.fn().mockResolvedValue([
          {
            chunkId: 'c1',
            documentId: 'd1',
            documentFilename: 'policy.pdf',
            content: 'relevant content',
            score: 0.9,
            pageNumber: 1,
            chunkIndex: 0,
            charOffset: null,
            metadata: {},
          },
        ]),
        ...overrides,
      } as unknown as RagStorageService;
    }

    it('should return formatted context when collection has matches', async () => {
      const ragService = createMockRagService();
      const result = await queryCollectionForContext(
        ragService,
        'test-org',
        'test-collection',
        'query text',
      );
      expect(result).toContain('[policy.pdf] relevant content');
    });

    it('should return empty string when ragService is undefined', async () => {
      const result = await queryCollectionForContext(
        undefined,
        'test-org',
        'test-collection',
        'query text',
      );
      expect(result).toBe('');
    });

    it('should return empty string when collection does not exist', async () => {
      const ragService = createMockRagService({
        getCollectionBySlug: jest.fn().mockResolvedValue(null),
      });
      const result = await queryCollectionForContext(
        ragService,
        'test-org',
        'nonexistent',
        'query text',
      );
      expect(result).toBe('');
    });

    it('should return empty string when no search results', async () => {
      const ragService = createMockRagService({
        keywordSearch: jest.fn().mockResolvedValue([]),
      });
      const result = await queryCollectionForContext(
        ragService,
        'test-org',
        'test-collection',
        'query text',
      );
      expect(result).toBe('');
    });

    it('should return empty string when RAG service throws', async () => {
      const ragService = createMockRagService({
        getCollectionBySlug: jest
          .fn()
          .mockRejectedValue(new Error('DB connection failed')),
      });
      const result = await queryCollectionForContext(
        ragService,
        'test-org',
        'test-collection',
        'query text',
      );
      expect(result).toBe('');
    });
  });
});
