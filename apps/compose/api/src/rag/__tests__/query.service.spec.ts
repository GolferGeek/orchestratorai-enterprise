import { Test, TestingModule } from '@nestjs/testing';
import { QueryService } from '../query.service';
import {
  RAG_STORAGE_SERVICE,
  RagStorageService,
  EMBEDDING_SERVICE,
  EmbeddingServiceProvider,
} from '../../rag-storage';

describe('QueryService', () => {
  let service: QueryService;
  let ragStorage: jest.Mocked<RagStorageService>;
  let embeddingService: jest.Mocked<EmbeddingServiceProvider>;

  const mockSearchResults = [
    {
      chunkId: 'chunk-1',
      documentId: 'doc-1',
      documentFilename: 'test.pdf',
      content: 'This is the first chunk content.',
      score: 0.95,
      pageNumber: 1,
      chunkIndex: 0,
      charOffset: null,
      metadata: {},
    },
    {
      chunkId: 'chunk-2',
      documentId: 'doc-1',
      documentFilename: 'test.pdf',
      content: 'This is the second chunk content.',
      score: 0.85,
      pageNumber: 1,
      chunkIndex: 1,
      charOffset: null,
      metadata: {},
    },
  ];

  const mockEmbedding = Array(768).fill(0.1);

  beforeEach(async () => {
    const mockRagStorage = {
      getCollections: jest.fn(),
      getCollection: jest.fn(),
      getCollectionBySlug: jest.fn(),
      createCollection: jest.fn(),
      updateCollection: jest.fn(),
      deleteCollection: jest.fn(),
      getDocuments: jest.fn(),
      getDocument: jest.fn(),
      getDocumentContent: jest.fn(),
      insertDocument: jest.fn(),
      updateDocumentContent: jest.fn(),
      updateDocumentStatus: jest.fn(),
      deleteDocument: jest.fn(),
      getDocumentChunks: jest.fn(),
      insertChunks: jest.fn(),
      vectorSearch: jest.fn(),
      keywordSearch: jest.fn(),
      isAvailable: jest.fn(),
      checkHealth: jest.fn(),
    };

    const mockEmbeddingService = {
      embed: jest.fn().mockResolvedValue(mockEmbedding),
      embedBatch: jest.fn(),
      embedWithTokenCount: jest.fn(),
      getDimensions: jest.fn().mockReturnValue(768),
      getRecommendedThreshold: jest.fn().mockReturnValue(0.6),
      checkHealth: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueryService,
        { provide: RAG_STORAGE_SERVICE, useValue: mockRagStorage },
        { provide: EMBEDDING_SERVICE, useValue: mockEmbeddingService },
      ],
    }).compile();

    service = module.get<QueryService>(QueryService);
    ragStorage = module.get(RAG_STORAGE_SERVICE);
    embeddingService = module.get(EMBEDDING_SERVICE);
  });

  describe('queryCollection', () => {
    it('should return search results for a query', async () => {
      ragStorage.vectorSearch.mockResolvedValue(mockSearchResults);

      const result = await service.queryCollection('collection-1', 'test-org', {
        query: 'test query',
        topK: 5,
      });

      expect(result.query).toBe('test query');
      expect(result.results).toHaveLength(2);
      expect(result.totalResults).toBe(2);
      expect(result.searchDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should generate embedding for query with model', async () => {
      ragStorage.vectorSearch.mockResolvedValue(mockSearchResults);

      await service.queryCollection(
        'collection-1',
        'test-org',
        { query: 'test query' },
        'nomic-embed-text',
      );

      expect(embeddingService.embed).toHaveBeenCalledWith(
        'test query',
        'nomic-embed-text',
      );
    });

    it('should pass correct parameters to vectorSearch', async () => {
      ragStorage.vectorSearch.mockResolvedValue([]);

      await service.queryCollection('collection-1', 'test-org', {
        query: 'test query',
        topK: 10,
        similarityThreshold: 0.7,
      });

      // Threshold is capped to model's recommended threshold (0.6 for nomic-embed-text)
      expect(ragStorage.vectorSearch).toHaveBeenCalledWith(
        'collection-1',
        'test-org',
        mockEmbedding,
        10,
        0.6,
      );
    });

    it('should include metadata when requested', async () => {
      ragStorage.vectorSearch.mockResolvedValue([
        { ...mockSearchResults[0]!, metadata: { key: 'value' } },
      ]);

      const result = await service.queryCollection('collection-1', 'test-org', {
        query: 'test query',
        includeMetadata: true,
      });

      expect(result.results[0]?.metadata).toEqual({ key: 'value' });
    });

    it('should not include metadata by default', async () => {
      ragStorage.vectorSearch.mockResolvedValue(mockSearchResults);

      const result = await service.queryCollection('collection-1', 'test-org', {
        query: 'test query',
        includeMetadata: false,
      });

      expect(result.results[0]?.metadata).toBeUndefined();
    });

    it('should format scores to 4 decimal places', async () => {
      ragStorage.vectorSearch.mockResolvedValue([
        { ...mockSearchResults[0]!, score: 0.123456789 },
      ]);

      const result = await service.queryCollection('collection-1', 'test-org', {
        query: 'test query',
      });

      expect(result.results[0]?.score).toBe(0.1235);
    });
  });

  describe('MMR search', () => {
    it('should use MMR strategy when specified', async () => {
      const manyResults = Array(10)
        .fill(null)
        .map((_, i) => ({
          ...mockSearchResults[0]!,
          chunkId: `chunk-${i}`,
          content: `Content ${i}`,
          score: 0.9 - i * 0.05,
        }));

      ragStorage.vectorSearch.mockResolvedValue(manyResults);

      const result = await service.queryCollection('collection-1', 'test-org', {
        query: 'test query',
        topK: 3,
        strategy: 'mmr',
      });

      expect(result.results).toHaveLength(3);
    });

    it('should return all results if fewer than topK candidates', async () => {
      ragStorage.vectorSearch.mockResolvedValue(mockSearchResults);

      const result = await service.queryCollection('collection-1', 'test-org', {
        query: 'test query',
        topK: 10,
        strategy: 'mmr',
      });

      expect(result.results).toHaveLength(2);
    });
  });
});
