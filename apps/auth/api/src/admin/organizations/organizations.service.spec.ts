import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import {
  OrganizationsService,
  Organization,
  CreateOrganizationDto,
  UpdateOrganizationDto,
} from './organizations.service';
import { DATABASE_SERVICE } from '@/database';

/**
 * Build a chainable mock query builder that resolves with the given result.
 */
function makeQueryChain(result: { data: unknown; error: unknown; count?: number | null }) {
  const chain: Record<string, jest.Mock> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.insert = jest.fn().mockReturnValue(chain);
  chain.update = jest.fn().mockReturnValue(chain);
  chain.delete = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.single = jest.fn().mockReturnValue(chain);
  chain.then = jest.fn((resolve: (v: unknown) => void) => resolve(result));
  return chain;
}

const mockDb = {
  from: jest.fn(),
  rpc: jest.fn(),
};

const sampleOrg: Organization = {
  slug: 'test-org',
  name: 'Test Organization',
  description: 'A test org',
  url: 'https://test.example.com',
  settings: {},
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('OrganizationsService', () => {
  let service: OrganizationsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        {
          provide: DATABASE_SERVICE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  describe('findAll', () => {
    it('should return all organizations', async () => {
      const chain = makeQueryChain({ data: [sampleOrg], error: null });
      mockDb.from.mockReturnValue(chain);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]!.slug).toBe('test-org');
    });

    it('should return empty array when no organizations exist', async () => {
      const chain = makeQueryChain({ data: [], error: null });
      mockDb.from.mockReturnValue(chain);

      const result = await service.findAll();

      expect(result).toHaveLength(0);
    });

    it('should return empty array when data is null', async () => {
      const chain = makeQueryChain({ data: null, error: null });
      mockDb.from.mockReturnValue(chain);

      const result = await service.findAll();

      expect(result).toHaveLength(0);
    });

    it('should throw HttpException when database error occurs', async () => {
      const chain = makeQueryChain({
        data: null,
        error: { message: 'Connection refused' },
      });
      mockDb.from.mockReturnValue(chain);

      let caughtError: unknown;
      try {
        await service.findAll();
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(HttpException);
      expect((caughtError as HttpException).getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('should throw with meaningful error message', async () => {
      const chain = makeQueryChain({
        data: null,
        error: { message: 'Table not found' },
      });
      mockDb.from.mockReturnValue(chain);

      await expect(service.findAll()).rejects.toThrow('Table not found');
    });
  });

  describe('findOne', () => {
    it('should return organization by slug', async () => {
      const chain = makeQueryChain({ data: sampleOrg, error: null });
      mockDb.from.mockReturnValue(chain);

      const result = await service.findOne('test-org');

      expect(result).not.toBeNull();
      expect(result!.slug).toBe('test-org');
      expect(result!.name).toBe('Test Organization');
    });

    it('should return null when organization not found (PGRST116)', async () => {
      const chain = makeQueryChain({
        data: null,
        error: { code: 'PGRST116', message: 'No rows returned' },
      });
      mockDb.from.mockReturnValue(chain);

      const result = await service.findOne('nonexistent-org');

      expect(result).toBeNull();
    });

    it('should throw HttpException for other database errors', async () => {
      const chain = makeQueryChain({
        data: null,
        error: { code: 'OTHER_ERROR', message: 'Database error' },
      });
      mockDb.from.mockReturnValue(chain);

      await expect(service.findOne('some-org')).rejects.toThrow(HttpException);
      await expect(service.findOne('some-org')).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    });
  });

  describe('create', () => {
    const createDto: CreateOrganizationDto = {
      slug: 'new-org',
      name: 'New Organization',
      description: 'Brand new org',
    };

    it('should create a new organization when slug does not exist', async () => {
      const newOrg: Organization = {
        ...createDto,
        settings: {},
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      // findOne returns null (no existing org), then insert returns new org
      const notFoundChain = makeQueryChain({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });
      const createChain = makeQueryChain({ data: newOrg, error: null });

      mockDb.from
        .mockReturnValueOnce(notFoundChain) // findOne
        .mockReturnValueOnce(createChain); // insert

      const result = await service.create(createDto);

      expect(result.slug).toBe('new-org');
      expect(result.name).toBe('New Organization');
    });

    it('should throw CONFLICT when organization slug already exists', async () => {
      const existingChain = makeQueryChain({ data: sampleOrg, error: null });
      mockDb.from.mockReturnValue(existingChain);

      let caughtError: unknown;
      try {
        await service.create({ slug: 'test-org', name: 'Dup' });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(HttpException);
      expect((caughtError as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
    });

    it('should throw HttpException when insert fails', async () => {
      const notFoundChain = makeQueryChain({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });
      const errorChain = makeQueryChain({
        data: null,
        error: { message: 'Insert failed' },
      });

      mockDb.from
        .mockReturnValueOnce(notFoundChain) // findOne
        .mockReturnValueOnce(errorChain); // insert error

      await expect(service.create(createDto)).rejects.toThrow(HttpException);
    });

    it('should apply defaults for optional fields', async () => {
      const notFoundChain = makeQueryChain({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });
      const created: Organization = {
        slug: 'minimal-org',
        name: 'Minimal',
        settings: {},
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      const createChain = makeQueryChain({ data: created, error: null });

      mockDb.from
        .mockReturnValueOnce(notFoundChain)
        .mockReturnValueOnce(createChain);

      const result = await service.create({ slug: 'minimal-org', name: 'Minimal' });

      expect(result.slug).toBe('minimal-org');
    });
  });

  describe('update', () => {
    const updateDto: UpdateOrganizationDto = {
      name: 'Updated Name',
      description: 'Updated description',
    };

    it('should update an existing organization', async () => {
      const updatedOrg = { ...sampleOrg, name: 'Updated Name' };

      const existingChain = makeQueryChain({ data: sampleOrg, error: null });
      const updateChain = makeQueryChain({ data: updatedOrg, error: null });

      mockDb.from
        .mockReturnValueOnce(existingChain) // findOne
        .mockReturnValueOnce(updateChain); // update

      const result = await service.update('test-org', updateDto);

      expect(result.name).toBe('Updated Name');
    });

    it('should throw NOT_FOUND when organization does not exist', async () => {
      const notFoundChain = makeQueryChain({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });
      mockDb.from.mockReturnValue(notFoundChain);

      let caughtError: unknown;
      try {
        await service.update('nonexistent', updateDto);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(HttpException);
      expect((caughtError as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('should throw HttpException when update fails', async () => {
      const existingChain = makeQueryChain({ data: sampleOrg, error: null });
      const errorChain = makeQueryChain({
        data: null,
        error: { message: 'Update failed' },
      });

      mockDb.from
        .mockReturnValueOnce(existingChain) // findOne
        .mockReturnValueOnce(errorChain); // update error

      await expect(service.update('test-org', updateDto)).rejects.toThrow(HttpException);
    });

    it('should only include defined fields in update payload', async () => {
      const updatedOrg = { ...sampleOrg, name: 'New Name Only' };
      const existingChain = makeQueryChain({ data: sampleOrg, error: null });
      const updateChain = makeQueryChain({ data: updatedOrg, error: null });

      mockDb.from
        .mockReturnValueOnce(existingChain)
        .mockReturnValueOnce(updateChain);

      // Only update name, not description
      const result = await service.update('test-org', { name: 'New Name Only' });

      expect(result.name).toBe('New Name Only');
    });
  });

  describe('delete', () => {
    it('should delete an existing organization with no agents', async () => {
      const existingChain = makeQueryChain({ data: sampleOrg, error: null });
      const agentsChain = makeQueryChain({ data: [], error: null });
      const deleteChain = makeQueryChain({ data: null, error: null });

      mockDb.from
        .mockReturnValueOnce(existingChain) // findOne
        .mockReturnValueOnce(agentsChain) // check agents
        .mockReturnValueOnce(deleteChain); // delete

      await expect(service.delete('test-org')).resolves.toBeUndefined();
    });

    it('should throw NOT_FOUND when organization does not exist', async () => {
      const notFoundChain = makeQueryChain({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });
      mockDb.from.mockReturnValue(notFoundChain);

      let caughtError: unknown;
      try {
        await service.delete('nonexistent');
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(HttpException);
      expect((caughtError as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('should throw CONFLICT when organization has assigned agents', async () => {
      const existingChain = makeQueryChain({ data: sampleOrg, error: null });
      const agentsChain = makeQueryChain({
        data: [{ slug: 'some-agent' }],
        error: null,
      });

      mockDb.from
        .mockReturnValueOnce(existingChain) // findOne
        .mockReturnValueOnce(agentsChain); // check agents - has agents

      let caughtError: unknown;
      try {
        await service.delete('test-org');
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(HttpException);
      expect((caughtError as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
    });

    it('should throw HttpException when delete query fails', async () => {
      const existingChain = makeQueryChain({ data: sampleOrg, error: null });
      const agentsChain = makeQueryChain({ data: [], error: null });
      const deleteErrorChain = makeQueryChain({
        data: null,
        error: { message: 'Delete failed' },
      });

      mockDb.from
        .mockReturnValueOnce(existingChain) // findOne
        .mockReturnValueOnce(agentsChain) // check agents
        .mockReturnValueOnce(deleteErrorChain); // delete error

      await expect(service.delete('test-org')).rejects.toThrow(HttpException);
    });
  });

  describe('getStats', () => {
    it('should return organization count', async () => {
      const chain = makeQueryChain({ data: null, error: null, count: 5 });
      mockDb.from.mockReturnValue(chain);

      const result = await service.getStats();

      expect(result.total).toBe(5);
    });

    it('should return 0 when count is null', async () => {
      const chain = makeQueryChain({ data: null, error: null, count: null });
      mockDb.from.mockReturnValue(chain);

      const result = await service.getStats();

      expect(result.total).toBe(0);
    });

    it('should return 0 when error occurs (non-throwing)', async () => {
      const chain = makeQueryChain({
        data: null,
        error: { message: 'Stats query failed' },
        count: null,
      });
      mockDb.from.mockReturnValue(chain);

      // getStats is resilient - returns 0 on error instead of throwing
      const result = await service.getStats();

      expect(result.total).toBe(0);
    });
  });
});
