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

  describe('segmentClauses', () => {
    const validClauseMapJson = JSON.stringify({
      entries: [
        {
          clauseId: 's1',
          sectionPath: '1',
          text: 'This Agreement is entered into...',
          definedTermsReferenced: ['Agreement', 'Effective Date'],
          sectionLevel: true,
          entryType: 'section',
        },
        {
          clauseId: 's2-c1',
          sectionPath: '2',
          text: 'Confidential Information means...',
          definedTermsReferenced: ['Confidential Information'],
          sectionLevel: false,
          entryType: 'clause',
        },
        {
          clauseId: 's2-c2',
          sectionPath: '2',
          text: 'The Receiving Party shall not disclose...',
          definedTermsReferenced: [
            'Receiving Party',
            'Confidential Information',
          ],
          sectionLevel: false,
          entryType: 'clause',
        },
      ],
      definedTerms: {
        'Confidential Information': 'means any non-public information...',
        'Receiving Party': 'means the party receiving Confidential Information',
      },
      sectionCount: 2,
      clauseCount: 2,
    });

    it('should call LLM and return parsed clause map', async () => {
      mockLLMClient.callLLM.mockResolvedValue({ text: validClauseMapJson });

      const clauseMap = await service.segmentClauses(
        mockCtx,
        'This is a short contract text for testing.',
      );

      expect(clauseMap.entries).toHaveLength(3);
      expect(clauseMap.sectionCount).toBe(2);
      expect(clauseMap.clauseCount).toBe(2);
      expect(clauseMap.definedTerms['Confidential Information']).toBeDefined();
      expect(mockLLMClient.callLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          callerName: 'legal-department:clause-segmentation',
          temperature: 0.1,
        }),
      );
    });

    it('should use existing metadata sections as seed data', async () => {
      mockLLMClient.callLLM.mockResolvedValue({ text: validClauseMapJson });

      const metadata = {
        sections: {
          sections: [
            {
              title: 'Recitals',
              type: 'recitals',
              startIndex: 0,
              endIndex: 100,
              content: 'Whereas...',
              confidence: 0.9,
            },
            {
              title: 'Definitions',
              type: 'definitions',
              startIndex: 100,
              endIndex: 500,
              content: 'For purposes of...',
              confidence: 0.8,
              clauses: [
                {
                  startIndex: 100,
                  endIndex: 200,
                  content: '1.1',
                  confidence: 0.8,
                },
              ],
            },
          ],
          confidence: 0.9,
          structureType: 'formal' as const,
        },
      } as import('../legal-department.state').LegalDocumentMetadata;

      await service.segmentClauses(mockCtx, 'short text', metadata);

      const callArgs = mockLLMClient.callLLM.mock.calls[0]![0];
      expect(callArgs.userMessage).toContain('Recitals');
      expect(callArgs.userMessage).toContain('Definitions');
    });

    it('should use chunked approach for large documents', async () => {
      mockLLMClient.callLLM.mockResolvedValue({ text: validClauseMapJson });

      const largeText = 'A'.repeat(35_000);
      await service.segmentClauses(mockCtx, largeText);

      expect(mockLLMClient.callLLM).toHaveBeenCalledTimes(2);
    });

    it('should throw when segmentation produces no entries', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          entries: [],
          definedTerms: {},
          sectionCount: 0,
          clauseCount: 0,
        }),
      });

      await expect(
        service.segmentClauses(mockCtx, 'Some contract text'),
      ).rejects.toThrow('no valid entries');
    });

    it('should throw when LLM returns unparseable JSON', async () => {
      mockLLMClient.callLLM.mockResolvedValue({ text: 'Not JSON at all' });

      await expect(
        service.segmentClauses(mockCtx, 'Contract text'),
      ).rejects.toThrow();
    });

    it('should throw when LLM call fails', async () => {
      mockLLMClient.callLLM.mockRejectedValue(new Error('LLM timeout'));

      await expect(
        service.segmentClauses(mockCtx, 'Contract text'),
      ).rejects.toThrow('LLM timeout');
    });

    it('should filter out entries without clauseId or text', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          entries: [
            {
              clauseId: 's1',
              sectionPath: '1',
              text: 'Valid clause',
              definedTermsReferenced: [],
              sectionLevel: false,
              entryType: 'clause',
            },
            {
              clauseId: '',
              sectionPath: '2',
              text: 'No ID',
              definedTermsReferenced: [],
              sectionLevel: false,
              entryType: 'clause',
            },
            {
              clauseId: 's3',
              sectionPath: '3',
              text: '',
              definedTermsReferenced: [],
              sectionLevel: false,
              entryType: 'clause',
            },
          ],
          definedTerms: {},
          sectionCount: 1,
          clauseCount: 1,
        }),
      });

      const result = await service.segmentClauses(mockCtx, 'Some text');
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.clauseId).toBe('s1');
    });

    it('should handle section-level fallback entries', async () => {
      mockLLMClient.callLLM.mockResolvedValue({
        text: JSON.stringify({
          entries: [
            {
              clauseId: 's1',
              sectionPath: '1',
              text: 'Entire section as one block',
              definedTermsReferenced: [],
              sectionLevel: true,
              entryType: 'section',
            },
          ],
          definedTerms: {},
          sectionCount: 1,
          clauseCount: 0,
        }),
      });

      const result = await service.segmentClauses(
        mockCtx,
        'Poorly formatted contract',
      );
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.sectionLevel).toBe(true);
      expect(result.entries[0]!.entryType).toBe('section');
    });
  });
});
