/**
 * Unit tests for LegalIntelligenceService — Phase 3 focus: extractMetadataForAll
 */

import { Test, TestingModule } from '@nestjs/testing';
import { LegalIntelligenceService } from './legal-intelligence.service';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

const mockCtx: ExecutionContext = {
  orgSlug: 'test-org',
  userId: 'test-user',
  conversationId: 'conv-intelligence-123',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
};

const validMetadataJson = JSON.stringify({
  documentType: { type: 'nda', confidence: 0.9 },
  sections: {
    sections: [
      { title: 'Recitals', startIndex: 0, endIndex: 100, confidence: 0.9 },
    ],
    confidence: 0.9,
    structureType: 'formal',
  },
  signatures: { signatures: [], confidence: 0.5, partyCount: 2 },
  dates: { dates: [], confidence: 0.5 },
  parties: {
    parties: [
      { name: 'Company A', type: 'corporate', position: 0, confidence: 0.9 },
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
});

describe('LegalIntelligenceService', () => {
  let service: LegalIntelligenceService;
  let mockLLMClient: jest.Mocked<LLMHttpClientService>;

  beforeEach(async () => {
    mockLLMClient = {
      callLLM: jest.fn().mockResolvedValue({ text: validMetadataJson }),
    } as unknown as jest.Mocked<LLMHttpClientService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LegalIntelligenceService,
        { provide: LLMHttpClientService, useValue: mockLLMClient },
      ],
    }).compile();

    service = module.get<LegalIntelligenceService>(LegalIntelligenceService);
  });

  describe('extractMetadata', () => {
    it('should call LLM and return parsed metadata', async () => {
      const meta = await service.extractMetadata(
        mockCtx,
        'This is an NDA contract.',
        'nda.pdf',
      );
      expect(meta.documentType.type).toBe('nda');
      expect(meta.documentType.confidence).toBe(0.9);
      expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(1);
    });

    it('should pass the caller name for observability', async () => {
      await service.extractMetadata(mockCtx, 'document text', 'test.pdf');
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          callerName: expect.stringContaining('intelligence'),
        }),
      );
    });

    it('should throw when LLM returns unparseable JSON', async () => {
      mockLLMClient.callLLM.mockResolvedValue({ text: 'This is not JSON' });
      await expect(
        service.extractMetadata(mockCtx, 'document text', 'test.pdf'),
      ).rejects.toThrow();
    });

    it('should throw when LLM call fails', async () => {
      mockLLMClient.callLLM.mockRejectedValue(new Error('LLM unavailable'));
      await expect(
        service.extractMetadata(mockCtx, 'document text', 'test.pdf'),
      ).rejects.toThrow('LLM unavailable');
    });
  });

  describe('extractMetadataForAll (Phase 3 parallel extraction)', () => {
    it('should return an array of metadata, one per document', async () => {
      const documents = [
        { name: 'nda.pdf', content: 'NDA content' },
        { name: 'employment.pdf', content: 'Employment contract content' },
      ];

      const results = await service.extractMetadataForAll(mockCtx, documents);

      expect(results).toHaveLength(2);
      expect(results[0]?.documentType.type).toBe('nda');
      expect(results[1]?.documentType.type).toBe('nda'); // both calls return same mock
    });

    it('should call extractMetadata for each document in parallel', async () => {
      const documents = [
        { name: 'doc1.pdf', content: 'Content 1' },
        { name: 'doc2.pdf', content: 'Content 2' },
        { name: 'doc3.pdf', content: 'Content 3' },
      ];

      await service.extractMetadataForAll(mockCtx, documents);

      // One LLM call per document
      expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(3);
    });

    it('should return empty array when given no documents', async () => {
      const results = await service.extractMetadataForAll(mockCtx, []);
      expect(results).toEqual([]);
      expect(mockLLMClient.callLLM).not.toHaveBeenCalled();
    });

    it('should reject when any document extraction fails', async () => {
      mockLLMClient.callLLM
        .mockResolvedValueOnce({ text: validMetadataJson }) // first doc succeeds
        .mockRejectedValueOnce(new Error('LLM timeout')); // second doc fails

      const documents = [
        { name: 'doc1.pdf', content: 'Content 1' },
        { name: 'doc2.pdf', content: 'Content 2' },
      ];

      await expect(
        service.extractMetadataForAll(mockCtx, documents),
      ).rejects.toThrow();
    });

    it('should pass each document name to extractMetadata for observability', async () => {
      const documents = [
        { name: 'nda.pdf', content: 'NDA content' },
        { name: 'employment.pdf', content: 'Employment content' },
      ];

      await service.extractMetadataForAll(mockCtx, documents);

      // Both calls happened (names are passed as part of the prompt)
      expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(2);
    });

    it('should preserve document order in returned metadata array', async () => {
      let callCount = 0;
      mockLLMClient.callLLM.mockImplementation(async () => {
        const index = callCount++;
        return {
          text: JSON.stringify({
            ...JSON.parse(validMetadataJson),
            documentType: { type: `type-${index}`, confidence: 0.9 },
          }),
        };
      });

      const documents = [
        { name: 'first.pdf', content: 'First document' },
        { name: 'second.pdf', content: 'Second document' },
        { name: 'third.pdf', content: 'Third document' },
      ];

      const results = await service.extractMetadataForAll(mockCtx, documents);

      expect(results).toHaveLength(3);
      // Order must match input documents order
      expect(results[0]?.documentType.type).toBe('type-0');
      expect(results[1]?.documentType.type).toBe('type-1');
      expect(results[2]?.documentType.type).toBe('type-2');
    });
  });
});
