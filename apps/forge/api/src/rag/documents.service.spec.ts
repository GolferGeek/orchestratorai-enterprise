import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { RAG_STORAGE_SERVICE, RagStorageService } from '../rag-storage';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let ragStorage: jest.Mocked<RagStorageService>;

  const mockDocument = {
    id: 'doc-123',
    collectionId: 'col-456',
    filename: 'test.pdf',
    fileType: 'pdf',
    fileSize: 1024,
    fileHash: 'abc123',
    storagePath: '/storage/test.pdf',
    content: 'Test content',
    status: 'completed' as const,
    errorMessage: null,
    chunkCount: 5,
    tokenCount: 100,
    metadata: { source: 'upload' },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    processedAt: new Date('2024-01-02'),
  };

  const mockChunk = {
    id: 'chunk-1',
    content: 'Chunk content',
    chunkIndex: 0,
    tokenCount: 20,
    pageNumber: 1,
    metadata: { position: 'start' },
  };

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: RAG_STORAGE_SERVICE, useValue: mockRagStorage },
      ],
    }).compile();

    module.useLogger(false);

    service = module.get<DocumentsService>(DocumentsService);
    ragStorage = module.get(RAG_STORAGE_SERVICE);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDocuments', () => {
    it('should return documents for a collection', async () => {
      ragStorage.getDocuments.mockResolvedValue([mockDocument]);

      const result = await service.getDocuments('col-456', 'test-org');

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('doc-123');
      expect(result[0]!.collectionId).toBe('col-456');
      expect(result[0]!.filename).toBe('test.pdf');
      expect(ragStorage.getDocuments).toHaveBeenCalledWith(
        'col-456',
        'test-org',
      );
    });

    it('should return empty array when no documents', async () => {
      ragStorage.getDocuments.mockResolvedValue([]);

      const result = await service.getDocuments('col-empty', 'test-org');

      expect(result).toHaveLength(0);
    });

    it('should return camelCase properties', async () => {
      ragStorage.getDocuments.mockResolvedValue([mockDocument]);

      const result = await service.getDocuments('col-456', 'test-org');

      expect(result[0]).toHaveProperty('collectionId');
      expect(result[0]).toHaveProperty('fileType');
      expect(result[0]).toHaveProperty('fileSize');
      expect(result[0]).toHaveProperty('fileHash');
      expect(result[0]).toHaveProperty('storagePath');
      expect(result[0]).toHaveProperty('errorMessage');
      expect(result[0]).toHaveProperty('chunkCount');
      expect(result[0]).toHaveProperty('tokenCount');
      expect(result[0]).toHaveProperty('createdAt');
      expect(result[0]).toHaveProperty('updatedAt');
      expect(result[0]).toHaveProperty('processedAt');
    });
  });

  describe('getDocument', () => {
    it('should return a single document', async () => {
      ragStorage.getDocument.mockResolvedValue(mockDocument);

      const result = await service.getDocument('doc-123', 'test-org');

      expect(result.id).toBe('doc-123');
      expect(ragStorage.getDocument).toHaveBeenCalledWith(
        'doc-123',
        'test-org',
      );
    });

    it('should throw NotFoundException when document not found', async () => {
      ragStorage.getDocument.mockResolvedValue(null);

      await expect(
        service.getDocument('non-existent', 'test-org'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createDocument', () => {
    it('should create a new document', async () => {
      ragStorage.insertDocument.mockResolvedValue(mockDocument);

      const result = await service.createDocument(
        'col-456',
        'test-org',
        'new.pdf',
        'pdf',
        2048,
        'hash123',
        '/storage/new.pdf',
        'user-123',
        'Initial content',
      );

      expect(result.filename).toBe('test.pdf');
      expect(ragStorage.insertDocument).toHaveBeenCalledWith(
        'col-456',
        'test-org',
        {
          filename: 'new.pdf',
          fileType: 'pdf',
          fileSize: 2048,
          fileHash: 'hash123',
          storagePath: '/storage/new.pdf',
          createdBy: 'user-123',
          content: 'Initial content',
        },
      );
    });

    it('should create document with optional params as null', async () => {
      ragStorage.insertDocument.mockResolvedValue(mockDocument);

      await service.createDocument(
        'col-456',
        'test-org',
        'new.pdf',
        'pdf',
        2048,
      );

      expect(ragStorage.insertDocument).toHaveBeenCalledWith(
        'col-456',
        'test-org',
        {
          filename: 'new.pdf',
          fileType: 'pdf',
          fileSize: 2048,
          fileHash: null,
          storagePath: null,
          createdBy: null,
          content: null,
        },
      );
    });
  });

  describe('updateDocumentContent', () => {
    it('should update document content', async () => {
      ragStorage.updateDocumentContent.mockResolvedValue(undefined);

      await service.updateDocumentContent(
        'doc-123',
        'test-org',
        'Updated content',
      );

      expect(ragStorage.updateDocumentContent).toHaveBeenCalledWith(
        'doc-123',
        'test-org',
        'Updated content',
      );
    });
  });

  describe('getDocumentContent', () => {
    it('should return document content', async () => {
      ragStorage.getDocumentContent.mockResolvedValue({
        id: 'doc-123',
        filename: 'test.pdf',
        fileType: 'pdf',
        content: 'Full content',
        chunkCount: 5,
      });

      const result = await service.getDocumentContent('doc-123', 'test-org');

      expect(result).toEqual({
        id: 'doc-123',
        filename: 'test.pdf',
        fileType: 'pdf',
        content: 'Full content',
        chunkCount: 5,
      });
    });

    it('should return null when document not found', async () => {
      ragStorage.getDocumentContent.mockResolvedValue(null);

      const result = await service.getDocumentContent(
        'non-existent',
        'test-org',
      );

      expect(result).toBeNull();
    });
  });

  describe('updateDocumentStatus', () => {
    it('should update document status', async () => {
      ragStorage.updateDocumentStatus.mockResolvedValue(mockDocument);

      const result = await service.updateDocumentStatus(
        'doc-123',
        'test-org',
        'completed',
      );

      expect(result.id).toBe('doc-123');
      expect(ragStorage.updateDocumentStatus).toHaveBeenCalledWith(
        'doc-123',
        'test-org',
        'completed',
        undefined,
        undefined,
        undefined,
      );
    });

    it('should update status with error message', async () => {
      ragStorage.updateDocumentStatus.mockResolvedValue({
        ...mockDocument,
        status: 'error' as const,
        errorMessage: 'Processing failed',
      });

      await service.updateDocumentStatus(
        'doc-123',
        'test-org',
        'error',
        'Processing failed',
      );

      expect(ragStorage.updateDocumentStatus).toHaveBeenCalledWith(
        'doc-123',
        'test-org',
        'error',
        'Processing failed',
        undefined,
        undefined,
      );
    });

    it('should update status with chunk and token counts', async () => {
      ragStorage.updateDocumentStatus.mockResolvedValue(mockDocument);

      await service.updateDocumentStatus(
        'doc-123',
        'test-org',
        'completed',
        undefined,
        10,
        200,
      );

      expect(ragStorage.updateDocumentStatus).toHaveBeenCalledWith(
        'doc-123',
        'test-org',
        'completed',
        undefined,
        10,
        200,
      );
    });

    it('should throw NotFoundException when document not found', async () => {
      ragStorage.updateDocumentStatus.mockResolvedValue(null);

      await expect(
        service.updateDocumentStatus('non-existent', 'test-org', 'completed'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteDocument', () => {
    it('should delete a document', async () => {
      ragStorage.deleteDocument.mockResolvedValue(true);

      const result = await service.deleteDocument('doc-123', 'test-org');

      expect(result).toBe(true);
      expect(ragStorage.deleteDocument).toHaveBeenCalledWith(
        'doc-123',
        'test-org',
      );
    });

    it('should throw NotFoundException when document not found', async () => {
      ragStorage.deleteDocument.mockResolvedValue(false);

      await expect(
        service.deleteDocument('non-existent', 'test-org'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDocumentChunks', () => {
    it('should return chunks for a document', async () => {
      ragStorage.getDocumentChunks.mockResolvedValue([
        mockChunk,
        { ...mockChunk, id: 'chunk-2', chunkIndex: 1 },
      ]);

      const result = await service.getDocumentChunks('doc-123', 'test-org');

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('chunk-1');
      expect(result[0]!.content).toBe('Chunk content');
      expect(result[0]!.chunkIndex).toBe(0);
      expect(result[0]!.tokenCount).toBe(20);
      expect(result[0]!.pageNumber).toBe(1);
    });

    it('should return empty array when no chunks', async () => {
      ragStorage.getDocumentChunks.mockResolvedValue([]);

      const result = await service.getDocumentChunks('doc-empty', 'test-org');

      expect(result).toHaveLength(0);
    });
  });

  describe('insertChunks', () => {
    it('should insert chunks for a document', async () => {
      ragStorage.insertChunks.mockResolvedValue(3);

      const chunks = [
        {
          content: 'Chunk 1',
          chunkIndex: 0,
          embedding: [0.1, 0.2, 0.3],
          tokenCount: 10,
          pageNumber: 1,
          charOffset: 0,
          metadata: {},
        },
        {
          content: 'Chunk 2',
          chunkIndex: 1,
          embedding: [0.4, 0.5, 0.6],
          tokenCount: 15,
          pageNumber: 1,
          charOffset: 100,
          metadata: {},
        },
        {
          content: 'Chunk 3',
          chunkIndex: 2,
          tokenCount: 12,
        },
      ];

      const result = await service.insertChunks('doc-123', 'test-org', chunks);

      expect(result).toBe(3);
      expect(ragStorage.insertChunks).toHaveBeenCalledWith(
        'doc-123',
        'test-org',
        [
          {
            content: 'Chunk 1',
            chunkIndex: 0,
            embedding: [0.1, 0.2, 0.3],
            tokenCount: 10,
            pageNumber: 1,
            charOffset: 0,
            metadata: {},
          },
          {
            content: 'Chunk 2',
            chunkIndex: 1,
            embedding: [0.4, 0.5, 0.6],
            tokenCount: 15,
            pageNumber: 1,
            charOffset: 100,
            metadata: {},
          },
          {
            content: 'Chunk 3',
            chunkIndex: 2,
            embedding: null,
            tokenCount: 12,
            pageNumber: null,
            charOffset: null,
            metadata: {},
          },
        ],
      );
    });

    it('should return 0 when no chunks inserted', async () => {
      ragStorage.insertChunks.mockResolvedValue(0);

      const result = await service.insertChunks('doc-123', 'test-org', []);

      expect(result).toBe(0);
    });

    it('should handle chunks without optional fields', async () => {
      ragStorage.insertChunks.mockResolvedValue(1);

      const chunks = [
        {
          content: 'Minimal chunk',
          chunkIndex: 0,
          tokenCount: 5,
        },
      ];

      await service.insertChunks('doc-123', 'test-org', chunks);

      expect(ragStorage.insertChunks).toHaveBeenCalledWith(
        'doc-123',
        'test-org',
        [
          {
            content: 'Minimal chunk',
            chunkIndex: 0,
            embedding: null,
            tokenCount: 5,
            pageNumber: null,
            charOffset: null,
            metadata: {},
          },
        ],
      );
    });
  });
});
