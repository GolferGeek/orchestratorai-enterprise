import { Test, TestingModule } from '@nestjs/testing';
import { RagManagementService } from './rag-management.service';
import { DATABASE_SERVICE } from '@orchestrator-ai/transport-types';

const makeCollectionRow = (
  overrides: Partial<Record<string, unknown>> = {},
) => ({
  id: 'col-uuid-1',
  organization_slug: 'org-a',
  name: 'Legal Docs',
  slug: 'legal-docs',
  description: 'Legal documents',
  embedding_model: 'text-embedding-3-small',
  embedding_dimensions: 1536,
  chunk_size: 512,
  chunk_overlap: 50,
  status: 'ready',
  document_count: 42,
  chunk_count: 300,
  total_tokens: 150000,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-02T00:00:00Z',
  complexity_type: 'standard',
  ...overrides,
});

const makeDocumentRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'doc-uuid-1',
  collection_id: 'col-uuid-1',
  organization_slug: 'org-a',
  filename: 'contract.pdf',
  file_type: 'application/pdf',
  file_size: 10240,
  status: 'processed',
  error_message: null,
  chunk_count: 7,
  token_count: 3500,
  metadata: {},
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  content: '',
  ...overrides,
});

const buildQueryBuilder = (result: { data: unknown; error: unknown }) => {
  const builder: Record<string, jest.Mock> = {};
  const chain = () =>
    builder as unknown as ReturnType<(typeof builder)['select']>;
  builder['select'] = jest.fn().mockReturnValue(chain());
  builder['insert'] = jest.fn().mockReturnValue(chain());
  builder['delete'] = jest.fn().mockReturnValue(chain());
  builder['eq'] = jest.fn().mockReturnValue(chain());
  builder['or'] = jest.fn().mockReturnValue(chain());
  builder['order'] = jest.fn().mockReturnValue(chain());
  builder['limit'] = jest.fn().mockReturnValue(chain());
  builder['single'] = jest.fn().mockReturnValue(chain());
  builder['then'] = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown) =>
      Promise.resolve(result).then(resolve),
    );
  return builder;
};

describe('RagManagementService', () => {
  let service: RagManagementService;
  let mockDb: { from: jest.Mock };

  beforeEach(async () => {
    mockDb = { from: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RagManagementService,
        { provide: DATABASE_SERVICE, useValue: mockDb },
      ],
    }).compile();

    service = module.get<RagManagementService>(RagManagementService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listCollections', () => {
    it('should return mapped collections from the database', async () => {
      const rows = [
        makeCollectionRow(),
        makeCollectionRow({ id: 'col-uuid-2', name: 'HR Docs' }),
      ];
      const qb = buildQueryBuilder({ data: rows, error: null });
      mockDb.from.mockReturnValue(qb);

      const result = await service.listCollections();

      expect(result.collections).toHaveLength(2);
      expect(result.collections[0]!.id).toBe('col-uuid-1');
      expect(result.collections[0]!.name).toBe('Legal Docs');
      expect(result.collections[0]!.documentCount).toBe(42);
      expect(result.collections[0]!.orgSlug).toBe('org-a');
    });

    it('should throw when database returns an error', async () => {
      const qb = buildQueryBuilder({
        data: null,
        error: { message: 'Schema missing' },
      });
      mockDb.from.mockReturnValue(qb);

      await expect(service.listCollections()).rejects.toThrow('Schema missing');
    });
  });

  describe('createCollection', () => {
    it('should insert a collection and return the mapped row', async () => {
      const dto = {
        name: 'New Collection',
        description: 'Desc',
        orgSlug: 'org-b',
      };
      const row = makeCollectionRow({
        id: 'col-new',
        name: 'New Collection',
        slug: 'new-collection',
        description: 'Desc',
        organization_slug: 'org-b',
      });
      const qb = buildQueryBuilder({ data: row, error: null });
      mockDb.from.mockReturnValue(qb);

      const result = await service.createCollection(dto);

      expect(result.id).toBe('col-new');
      expect(result.name).toBe('New Collection');
      expect(result.orgSlug).toBe('org-b');
    });

    it('should throw when insert fails', async () => {
      const qb = buildQueryBuilder({
        data: null,
        error: { message: 'Duplicate slug' },
      });
      mockDb.from.mockReturnValue(qb);

      await expect(
        service.createCollection({
          name: 'X',
          description: '',
          orgSlug: 'org-a',
        }),
      ).rejects.toThrow('Duplicate slug');
    });
  });

  describe('deleteCollection', () => {
    it('should delete a collection without error', async () => {
      const qb = buildQueryBuilder({ data: null, error: null });
      mockDb.from.mockReturnValue(qb);

      await expect(
        service.deleteCollection('col-uuid-1'),
      ).resolves.toBeUndefined();
    });

    it('should throw when delete fails', async () => {
      const qb = buildQueryBuilder({
        data: null,
        error: { message: 'Row not found' },
      });
      mockDb.from.mockReturnValue(qb);

      await expect(service.deleteCollection('bad-id')).rejects.toThrow(
        'Row not found',
      );
    });
  });

  describe('listDocuments', () => {
    it('should return mapped documents for a collection', async () => {
      const rows = [
        makeDocumentRow(),
        makeDocumentRow({ id: 'doc-uuid-2', filename: 'policy.pdf' }),
      ];
      const qb = buildQueryBuilder({ data: rows, error: null });
      mockDb.from.mockReturnValue(qb);

      const result = await service.listDocuments('col-uuid-1');

      expect(result.collectionId).toBe('col-uuid-1');
      expect(result.documents).toHaveLength(2);
      expect(result.documents[0]!.filename).toBe('contract.pdf');
      expect(result.documents[0]!.contentType).toBe('application/pdf');
      expect(result.documents[0]!.sizeBytes).toBe(10240);
    });

    it('should throw when database returns an error', async () => {
      const qb = buildQueryBuilder({
        data: null,
        error: { message: 'Permission denied' },
      });
      mockDb.from.mockReturnValue(qb);

      await expect(service.listDocuments('col-uuid-1')).rejects.toThrow(
        'Permission denied',
      );
    });
  });
});
