import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CollectionsService } from '../collections.service';
import {
  RAG_STORAGE_SERVICE,
  RagStorageService,
  RagCollection,
  EMBEDDING_SERVICE,
} from '../../rag-storage';

describe('CollectionsService', () => {
  let service: CollectionsService;
  let ragStorage: jest.Mocked<RagStorageService>;

  const mockCollection: RagCollection = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    organizationSlug: 'test-org',
    name: 'Test Collection',
    slug: 'test-collection',
    description: 'A test collection',
    embeddingModel: 'nomic-embed-text',
    embeddingDimensions: 768,
    chunkSize: 1000,
    chunkOverlap: 200,
    status: 'active',
    requiredRole: null,
    allowedUsers: null,
    complexityType: 'basic',
    documentCount: 5,
    chunkCount: 100,
    totalTokens: 50000,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
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
        CollectionsService,
        { provide: RAG_STORAGE_SERVICE, useValue: mockRagStorage },
        {
          provide: EMBEDDING_SERVICE,
          useValue: {
            embed: jest.fn(),
            embedBatch: jest.fn(),
            embedWithTokenCount: jest.fn(),
            getDimensions: jest.fn((model: string) => {
              const dims: Record<string, number> = {
                'nomic-embed-text': 768,
                'text-embedding-3-small': 1536,
                'text-embedding-3-large': 3072,
              };
              return dims[model] || 768;
            }),
            getRecommendedThreshold: jest.fn().mockReturnValue(0.6),
            checkHealth: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CollectionsService>(CollectionsService);
    ragStorage = module.get(RAG_STORAGE_SERVICE);
  });

  describe('getCollections', () => {
    it('should return collections for an organization', async () => {
      ragStorage.getCollections.mockResolvedValue([mockCollection]);

      const result = await service.getCollections('test-org');

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('Test Collection');
      expect(result[0]?.organizationSlug).toBe('test-org');
      expect(ragStorage.getCollections).toHaveBeenCalledWith(
        'test-org',
        undefined,
      );
    });

    it('should return empty array when no collections exist', async () => {
      ragStorage.getCollections.mockResolvedValue([]);

      const result = await service.getCollections('empty-org');

      expect(result).toEqual([]);
    });
  });

  describe('getCollection', () => {
    it('should return a single collection', async () => {
      ragStorage.getCollection.mockResolvedValue(mockCollection);

      const result = await service.getCollection(mockCollection.id, 'test-org');

      expect(result.id).toBe(mockCollection.id);
      expect(result.name).toBe('Test Collection');
    });

    it('should throw NotFoundException when collection not found', async () => {
      ragStorage.getCollection.mockResolvedValue(null);

      await expect(
        service.getCollection('nonexistent-id', 'test-org'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createCollection', () => {
    it('should create a collection with default settings', async () => {
      ragStorage.createCollection.mockResolvedValue(mockCollection);

      const result = await service.createCollection('test-org', {
        name: 'Test Collection',
      });

      expect(result.name).toBe('Test Collection');
      expect(ragStorage.createCollection).toHaveBeenCalledWith(
        'test-org',
        expect.objectContaining({
          name: 'Test Collection',
          slug: 'test-collection',
          embeddingModel: 'nomic-embed-text',
          embeddingDimensions: 768,
        }),
      );
    });

    it('should generate slug from name', async () => {
      ragStorage.createCollection.mockResolvedValue({
        ...mockCollection,
        slug: 'my-new-collection',
      });

      await service.createCollection('test-org', {
        name: 'My New Collection',
      });

      expect(ragStorage.createCollection).toHaveBeenCalledWith(
        'test-org',
        expect.objectContaining({ slug: 'my-new-collection' }),
      );
    });

    it('should use provided slug', async () => {
      ragStorage.createCollection.mockResolvedValue({
        ...mockCollection,
        slug: 'custom-slug',
      });

      await service.createCollection('test-org', {
        name: 'Test Collection',
        slug: 'custom-slug',
      });

      expect(ragStorage.createCollection).toHaveBeenCalledWith(
        'test-org',
        expect.objectContaining({ slug: 'custom-slug' }),
      );
    });
  });

  describe('updateCollection', () => {
    it('should update collection name', async () => {
      ragStorage.updateCollection.mockResolvedValue({
        ...mockCollection,
        name: 'Updated Name',
      });

      const result = await service.updateCollection(
        mockCollection.id,
        'test-org',
        { name: 'Updated Name' },
      );

      expect(result.name).toBe('Updated Name');
    });

    it('should throw NotFoundException when collection not found', async () => {
      ragStorage.updateCollection.mockResolvedValue(null);

      await expect(
        service.updateCollection('nonexistent-id', 'test-org', {
          name: 'New Name',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteCollection', () => {
    it('should delete collection and return true', async () => {
      ragStorage.deleteCollection.mockResolvedValue(true);

      const result = await service.deleteCollection(
        mockCollection.id,
        'test-org',
      );

      expect(result).toBe(true);
    });

    it('should throw NotFoundException when collection not found', async () => {
      ragStorage.deleteCollection.mockResolvedValue(false);

      await expect(
        service.deleteCollection('nonexistent-id', 'test-org'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
