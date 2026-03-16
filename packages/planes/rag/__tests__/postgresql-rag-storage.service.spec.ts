import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PostgresqlRagStorageService } from '../postgresql-rag-storage.service';

const mockQuery = jest.fn();
const mockPool = {
  query: mockQuery,
};

jest.mock('pg', () => {
  return {
    Pool: jest.fn().mockImplementation(() => mockPool),
  };
});

describe('PostgresqlRagStorageService', () => {
  let service: PostgresqlRagStorageService;

  const configValues: Record<string, string> = {
    POSTGRESQL_URL:
      'postgresql://postgres:secret@test-db-host:5432/orchestrator_ai',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostgresqlRagStorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultVal?: string) => {
              return configValues[key] ?? defaultVal;
            }),
            getOrThrow: jest.fn((key: string) => {
              const val = configValues[key];
              if (!val) throw new Error(`Missing ${key}`);
              return val;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(PostgresqlRagStorageService);

    // Pre-warm the pool by forcing pool creation
    const { Pool: MockPool } = jest.requireMock<typeof import('pg')>('pg');
    (MockPool as unknown as jest.Mock).mockImplementation(() => mockPool);
  });

  // ---------------------------------------------------------------------------
  // Collections
  // ---------------------------------------------------------------------------

  describe('getCollections()', () => {
    it('should return mapped collections', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'col-1',
            organization_slug: 'acme',
            name: 'Test Collection',
            slug: 'test-collection',
            description: 'A test collection',
            embedding_model: 'text-embedding-3-small',
            embedding_dimensions: 1536,
            chunk_size: 512,
            chunk_overlap: 64,
            status: 'active',
            required_role: null,
            allowed_users: null,
            complexity_type: 'basic',
            created_by: 'user-1',
            document_count: 0,
            chunk_count: 0,
            total_tokens: 0,
            created_at: new Date('2025-01-01'),
            updated_at: new Date('2025-01-01'),
          },
        ],
        rowCount: 1,
      });

      const result = await service.getCollections('acme');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM rag_data.rag_collections'),
        ['acme'],
      );
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('col-1');
      expect(result[0]!.organizationSlug).toBe('acme');
      expect(result[0]!.name).toBe('Test Collection');
    });
  });

  describe('getCollection()', () => {
    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.getCollection('nonexistent', 'acme');

      expect(result).toBeNull();
    });

    it('should return mapped collection when found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'col-1',
            organization_slug: 'acme',
            name: 'Test',
            slug: 'test',
            description: null,
            embedding_model: 'text-embedding-3-small',
            embedding_dimensions: 1536,
            chunk_size: 512,
            chunk_overlap: 64,
            status: 'active',
            required_role: null,
            allowed_users: null,
            complexity_type: 'basic',
            created_by: null,
            document_count: 0,
            chunk_count: 0,
            total_tokens: 0,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        rowCount: 1,
      });

      const result = await service.getCollection('col-1', 'acme');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('col-1');
    });
  });

  describe('getCollectionBySlug()', () => {
    it('should query by slug and organization_slug', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await service.getCollectionBySlug('my-collection', 'acme');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE slug = $1 AND organization_slug = $2'),
        ['my-collection', 'acme'],
      );
    });
  });

  describe('createCollection()', () => {
    it('should insert and return mapped collection', async () => {
      const created = {
        id: 'col-new',
        organization_slug: 'acme',
        name: 'New Collection',
        slug: 'new-collection',
        description: 'desc',
        embedding_model: 'text-embedding-3-small',
        embedding_dimensions: 1536,
        chunk_size: 512,
        chunk_overlap: 64,
        status: 'active',
        required_role: null,
        allowed_users: null,
        complexity_type: 'basic',
        created_by: 'user-1',
        document_count: 0,
        chunk_count: 0,
        total_tokens: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [created], rowCount: 1 });

      const result = await service.createCollection('acme', {
        name: 'New Collection',
        slug: 'new-collection',
        description: 'desc',
        embeddingModel: 'text-embedding-3-small',
        embeddingDimensions: 1536,
        chunkSize: 512,
        chunkOverlap: 64,
        createdBy: 'user-1',
        requiredRole: null,
        allowedUsers: null,
        complexityType: 'basic',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO rag_data.rag_collections'),
        expect.arrayContaining(['acme', 'New Collection', 'new-collection']),
      );
      expect(result.id).toBe('col-new');
      expect(result.name).toBe('New Collection');
    });
  });

  describe('updateCollection()', () => {
    it('should update and return mapped collection', async () => {
      const updated = {
        id: 'col-1',
        organization_slug: 'acme',
        name: 'Updated Name',
        slug: 'test',
        description: null,
        embedding_model: 'text-embedding-3-small',
        embedding_dimensions: 1536,
        chunk_size: 512,
        chunk_overlap: 64,
        status: 'active',
        required_role: null,
        allowed_users: null,
        complexity_type: 'basic',
        created_by: null,
        document_count: 0,
        chunk_count: 0,
        total_tokens: 0,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [updated], rowCount: 1 });

      const result = await service.updateCollection('col-1', 'acme', {
        name: 'Updated Name',
        description: null,
        requiredRole: null,
        allowedUsers: null,
        clearAllowedUsers: false,
        complexityType: null,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE rag_data.rag_collections'),
        expect.arrayContaining(['Updated Name']),
      );
      expect(result!.name).toBe('Updated Name');
    });

    it('should return existing collection when no fields to update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.updateCollection('col-1', 'acme', {
        name: null,
        description: null,
        requiredRole: null,
        allowedUsers: null,
        clearAllowedUsers: false,
        complexityType: null,
      });

      expect(result).toBeNull();
    });
  });

  describe('deleteCollection()', () => {
    it('should delete and return true', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await service.deleteCollection('col-1', 'acme');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM rag_data.rag_collections'),
        ['col-1', 'acme'],
      );
      expect(result).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Documents
  // ---------------------------------------------------------------------------

  describe('getDocuments()', () => {
    it('should return mapped documents', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'doc-1',
            collection_id: 'col-1',
            filename: 'test.pdf',
            file_type: 'pdf',
            file_size: 1024,
            file_hash: null,
            storage_path: null,
            content: null,
            status: 'pending',
            error_message: null,
            chunk_count: 0,
            token_count: 0,
            metadata: '{}',
            created_at: new Date(),
            updated_at: new Date(),
            processed_at: null,
          },
        ],
        rowCount: 1,
      });

      const result = await service.getDocuments('col-1', 'acme');

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('doc-1');
      expect(result[0]!.filename).toBe('test.pdf');
    });
  });

  describe('getDocument()', () => {
    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.getDocument('nonexistent', 'acme');

      expect(result).toBeNull();
    });
  });

  describe('getDocumentContent()', () => {
    it('should return document content', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'doc-1',
            filename: 'test.pdf',
            file_type: 'pdf',
            content: 'document content here',
            chunk_count: 3,
          },
        ],
        rowCount: 1,
      });

      const result = await service.getDocumentContent('doc-1', 'acme');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('doc-1');
      expect(result!.content).toBe('document content here');
      expect(result!.chunkCount).toBe(3);
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await service.getDocumentContent('nonexistent', 'acme');

      expect(result).toBeNull();
    });
  });

  describe('insertDocument()', () => {
    it('should insert and return mapped document', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'doc-new',
            collection_id: 'col-1',
            filename: 'upload.txt',
            file_type: 'text/plain',
            file_size: 512,
            file_hash: null,
            storage_path: null,
            content: 'some content',
            status: 'pending',
            error_message: null,
            chunk_count: 0,
            token_count: 0,
            metadata: '{}',
            created_at: new Date(),
            updated_at: new Date(),
            processed_at: null,
          },
        ],
        rowCount: 1,
      });

      const result = await service.insertDocument('col-1', 'acme', {
        filename: 'upload.txt',
        fileType: 'text/plain',
        fileSize: 512,
        fileHash: null,
        storagePath: null,
        createdBy: 'user-1',
        content: 'some content',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO rag_data.rag_documents'),
        expect.arrayContaining(['col-1', 'acme', 'upload.txt']),
      );
      expect(result.id).toBe('doc-new');
    });
  });

  describe('updateDocumentStatus()', () => {
    it('should update status with optional fields', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'doc-1',
            collection_id: 'col-1',
            filename: 'test.pdf',
            file_type: 'pdf',
            file_size: 1024,
            file_hash: null,
            storage_path: null,
            content: null,
            status: 'completed',
            error_message: null,
            chunk_count: 10,
            token_count: 500,
            metadata: '{}',
            created_at: new Date(),
            updated_at: new Date(),
            processed_at: null,
          },
        ],
        rowCount: 1,
      });

      const result = await service.updateDocumentStatus(
        'doc-1',
        'acme',
        'completed',
        undefined,
        10,
        500,
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE rag_data.rag_documents'),
        expect.arrayContaining(['completed', 10, 500]),
      );
      expect(result!.status).toBe('completed');
    });
  });

  describe('deleteDocument()', () => {
    it('should delete and return true', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await service.deleteDocument('doc-1', 'acme');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM rag_data.rag_documents'),
        ['doc-1', 'acme'],
      );
      expect(result).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Chunks
  // ---------------------------------------------------------------------------

  describe('getDocumentChunks()', () => {
    it('should return mapped chunks ordered by index', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'chunk-1',
            content: 'chunk content',
            chunk_index: 0,
            token_count: 50,
            page_number: 1,
            metadata: '{}',
          },
        ],
        rowCount: 1,
      });

      const result = await service.getDocumentChunks('doc-1', 'acme');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY chunk_index ASC'),
        ['doc-1', 'acme'],
      );
      expect(result).toHaveLength(1);
      expect(result[0]!.chunkIndex).toBe(0);
    });
  });

  describe('insertChunks()', () => {
    it('should return 0 for empty chunks array', async () => {
      const result = await service.insertChunks('doc-1', 'acme', []);
      expect(result).toBe(0);
    });

    it('should insert chunks and return count', async () => {
      // getDocument call
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'doc-1',
            collection_id: 'col-1',
            filename: 'test.pdf',
            file_type: 'pdf',
            file_size: 1024,
            file_hash: null,
            storage_path: null,
            content: null,
            status: 'processing',
            error_message: null,
            chunk_count: 0,
            token_count: 0,
            metadata: '{}',
            created_at: new Date(),
            updated_at: new Date(),
            processed_at: null,
          },
        ],
        rowCount: 1,
      });
      // chunk insert
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await service.insertChunks('doc-1', 'acme', [
        {
          content: 'chunk text',
          chunkIndex: 0,
          embedding: [0.1, 0.2, 0.3],
          tokenCount: 10,
          pageNumber: 1,
          charOffset: 0,
          metadata: {},
        },
      ]);

      expect(result).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  describe('vectorSearch()', () => {
    it('should use pgvector <=> cosine distance operator', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'chunk-1',
            document_id: 'doc-1',
            content: 'relevant content',
            chunk_index: 0,
            page_number: 1,
            char_offset: 0,
            metadata: '{}',
            filename: 'doc.pdf',
            score: '0.92',
          },
        ],
        rowCount: 1,
      });

      const embedding = [0.1, 0.2, 0.3];
      const result = await service.vectorSearch(
        'col-1',
        'acme',
        embedding,
        5,
        0.7,
      );

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('<=>');
      expect(sql).toContain('::vector');
      expect(sql).toContain('ORDER BY score DESC');
      expect(result).toHaveLength(1);
      expect(result[0]!.chunkId).toBe('chunk-1');
      expect(result[0]!.score).toBeCloseTo(0.92);
    });

    it('should filter by similarity threshold', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await service.vectorSearch('col-1', 'acme', [0.1, 0.2], 10, 0.85);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('>= $3');
    });
  });

  describe('keywordSearch()', () => {
    it('should return empty array for very short terms', async () => {
      const result = await service.keywordSearch('col-1', 'acme', 'a b', 5);
      expect(result).toEqual([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should use full text search with ts_rank', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'chunk-1',
            document_id: 'doc-1',
            content: 'relevant content about orchestration',
            chunk_index: 0,
            page_number: null,
            char_offset: null,
            metadata: '{}',
            filename: 'doc.pdf',
            score: '0.5',
          },
        ],
        rowCount: 1,
      });

      const result = await service.keywordSearch(
        'col-1',
        'acme',
        'orchestration agent',
        5,
      );

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ts_rank');
      expect(sql).toContain('to_tsvector');
      expect(sql).toContain('to_tsquery');
      expect(result).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Infrastructure
  // ---------------------------------------------------------------------------

  describe('isAvailable()', () => {
    it('should return true', () => {
      expect(service.isAvailable()).toBe(true);
    });
  });

  describe('checkHealth()', () => {
    it('should return ok status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ok: 1 }], rowCount: 1 });

      const result = await service.checkHealth();

      expect(result.status).toBe('ok');
    });

    it('should return error status on failure', async () => {
      mockQuery.mockRejectedValueOnce(new Error('connection refused'));

      const result = await service.checkHealth();

      expect(result.status).toBe('error');
      expect(result.message).toBe('connection refused');
    });
  });
});
