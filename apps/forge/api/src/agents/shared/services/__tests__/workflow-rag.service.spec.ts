import { WorkflowRagService } from '../workflow-rag.service';
import type {
  RagStorageService,
  RagCollection,
} from '@orchestratorai/planes/rag';
import type {
  QueryService,
  QueryResponse,
} from '../../../../rag/query.service';

function createMockRagStorage(
  overrides: Partial<RagStorageService> = {},
): RagStorageService {
  return {
    getCollectionBySlug: jest.fn().mockResolvedValue(null),
    getCollections: jest.fn(),
    getCollection: jest.fn(),
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
    isAvailable: jest.fn().mockReturnValue(true),
    checkHealth: jest.fn(),
    ...overrides,
  } as RagStorageService;
}

function createMockQueryService(
  overrides: Partial<QueryService> = {},
): QueryService {
  return {
    queryCollection: jest.fn(),
    queryByComplexity: jest.fn().mockResolvedValue({
      query: 'test',
      results: [],
      totalResults: 0,
      searchDurationMs: 10,
    } as QueryResponse),
    ...overrides,
  } as unknown as QueryService;
}

const MOCK_COLLECTION: RagCollection = {
  id: 'col-123',
  organizationSlug: 'big-ideas',
  name: 'Test Collection',
  slug: 'test-collection',
  embeddingModel: 'nomic-embed-text',
  embeddingDimensions: 768,
  chunkSize: 1000,
  chunkOverlap: 200,
  description: 'Test',
  status: 'active',
  requiredRole: null,
  allowedUsers: [],
  complexityType: 'hybrid',
  createdBy: null,
  documentCount: 5,
  chunkCount: 50,
  totalTokens: 10000,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('WorkflowRagService', () => {
  it('returns formatted context when collection exists and has results', async () => {
    const ragStorage = createMockRagStorage({
      getCollectionBySlug: jest.fn().mockResolvedValue(MOCK_COLLECTION),
    });
    const queryService = createMockQueryService({
      queryByComplexity: jest.fn().mockResolvedValue({
        query: 'test query',
        results: [
          {
            chunkId: 'c1',
            documentId: 'd1',
            documentFilename: 'policy.md',
            content: 'Found content one',
            score: 0.85,
            pageNumber: null,
            chunkIndex: 0,
          },
          {
            chunkId: 'c2',
            documentId: 'd2',
            documentFilename: 'clause.md',
            content: 'Found content two',
            score: 0.72,
            pageNumber: null,
            chunkIndex: 0,
          },
        ],
        totalResults: 2,
        searchDurationMs: 15,
      }),
    });

    const service = new WorkflowRagService(ragStorage, queryService);
    const result = await service.getContext({
      collectionSlug: 'test-collection',
      orgSlug: 'big-ideas',
      query: 'test query',
    });

    expect(result).toContain('Relevant Reference Material');
    expect(result).toContain('[policy.md] Found content one');
    expect(result).toContain('[clause.md] Found content two');
    expect(queryService.queryByComplexity).toHaveBeenCalledWith(
      'col-123',
      'big-ideas',
      'hybrid',
      expect.objectContaining({ query: 'test query', topK: 5 }),
      'nomic-embed-text',
    );
  });

  it('returns empty string when collection not found', async () => {
    const ragStorage = createMockRagStorage({
      getCollectionBySlug: jest.fn().mockResolvedValue(null),
    });
    const queryService = createMockQueryService();

    const service = new WorkflowRagService(ragStorage, queryService);
    const result = await service.getContext({
      collectionSlug: 'nonexistent',
      orgSlug: 'big-ideas',
      query: 'test',
    });

    expect(result).toBe('');
    expect(queryService.queryByComplexity).not.toHaveBeenCalled();
  });

  it('returns empty string when query returns no results', async () => {
    const ragStorage = createMockRagStorage({
      getCollectionBySlug: jest.fn().mockResolvedValue(MOCK_COLLECTION),
    });
    const queryService = createMockQueryService({
      queryByComplexity: jest.fn().mockResolvedValue({
        query: 'test',
        results: [],
        totalResults: 0,
        searchDurationMs: 5,
      }),
    });

    const service = new WorkflowRagService(ragStorage, queryService);
    const result = await service.getContext({
      collectionSlug: 'test-collection',
      orgSlug: 'big-ideas',
      query: 'obscure query',
    });

    expect(result).toBe('');
  });

  it('returns empty string on error (soft-fail)', async () => {
    const ragStorage = createMockRagStorage({
      getCollectionBySlug: jest
        .fn()
        .mockRejectedValue(new Error('DB connection failed')),
    });
    const queryService = createMockQueryService();

    const service = new WorkflowRagService(ragStorage, queryService);
    const result = await service.getContext({
      collectionSlug: 'test-collection',
      orgSlug: 'big-ideas',
      query: 'test',
    });

    expect(result).toBe('');
  });

  it('returns empty string when ragStorage is undefined', async () => {
    const service = new WorkflowRagService(undefined, undefined);
    const result = await service.getContext({
      collectionSlug: 'test-collection',
      orgSlug: 'big-ideas',
      query: 'test',
    });

    expect(result).toBe('');
  });
});
