import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService, Organization } from './organizations.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';

const sampleOrg: Organization = {
  slug: 'test-org',
  name: 'Test Organization',
  description: 'A test org',
  url: 'https://test.example.com',
  settings: {},
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const mockOrganizationsService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  getStats: jest.fn(),
};

describe('OrganizationsController', () => {
  let controller: OrganizationsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        {
          provide: OrganizationsService,
          useValue: mockOrganizationsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OrganizationsController>(OrganizationsController);
  });

  describe('findAll', () => {
    it('should return all organizations', async () => {
      mockOrganizationsService.findAll.mockResolvedValue([sampleOrg]);

      const result = await controller.findAll();

      expect(result).toHaveLength(1);
      expect(result[0]!.slug).toBe('test-org');
      expect(mockOrganizationsService.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no organizations exist', async () => {
      mockOrganizationsService.findAll.mockResolvedValue([]);

      const result = await controller.findAll();

      expect(result).toHaveLength(0);
    });

    it('should propagate errors from service', async () => {
      mockOrganizationsService.findAll.mockRejectedValue(
        new HttpException('DB Error', HttpStatus.INTERNAL_SERVER_ERROR),
      );

      await expect(controller.findAll()).rejects.toThrow(HttpException);
    });
  });

  describe('getStats', () => {
    it('should return organization statistics', async () => {
      mockOrganizationsService.getStats.mockResolvedValue({ total: 10 });

      const result = await controller.getStats();

      expect(result.total).toBe(10);
      expect(mockOrganizationsService.getStats).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('should return a single organization by slug', async () => {
      mockOrganizationsService.findOne.mockResolvedValue(sampleOrg);

      const result = await controller.findOne('test-org');

      expect(result.slug).toBe('test-org');
      expect(result.name).toBe('Test Organization');
      expect(mockOrganizationsService.findOne).toHaveBeenCalledWith('test-org');
    });

    it('should throw NOT_FOUND when organization does not exist', async () => {
      mockOrganizationsService.findOne.mockResolvedValue(null);

      await expect(controller.findOne('nonexistent')).rejects.toThrow(
        HttpException,
      );

      let caughtError: unknown;
      try {
        await controller.findOne('nonexistent');
      } catch (err) {
        caughtError = err;
      }

      expect((caughtError as HttpException).getStatus()).toBe(
        HttpStatus.NOT_FOUND,
      );
    });

    it('should propagate service errors', async () => {
      mockOrganizationsService.findOne.mockRejectedValue(
        new HttpException('DB Error', HttpStatus.INTERNAL_SERVER_ERROR),
      );

      await expect(controller.findOne('test-org')).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('create', () => {
    it('should create a new organization', async () => {
      const createDto = { slug: 'new-org', name: 'New Org' };
      const created = { ...sampleOrg, ...createDto };
      mockOrganizationsService.create.mockResolvedValue(created);

      const result = await controller.create(createDto);

      expect(result.slug).toBe('new-org');
      expect(mockOrganizationsService.create).toHaveBeenCalledWith(createDto);
    });

    it('should propagate CONFLICT errors from service', async () => {
      mockOrganizationsService.create.mockRejectedValue(
        new HttpException('Slug already exists', HttpStatus.CONFLICT),
      );

      await expect(
        controller.create({ slug: 'test-org', name: 'Dup' }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('update', () => {
    it('should update an existing organization', async () => {
      const updateDto = { name: 'Updated Name' };
      const updated = { ...sampleOrg, name: 'Updated Name' };
      mockOrganizationsService.update.mockResolvedValue(updated);

      const result = await controller.update('test-org', updateDto);

      expect(result.name).toBe('Updated Name');
      expect(mockOrganizationsService.update).toHaveBeenCalledWith(
        'test-org',
        updateDto,
      );
    });

    it('should propagate NOT_FOUND errors from service', async () => {
      mockOrganizationsService.update.mockRejectedValue(
        new HttpException('Organization not found', HttpStatus.NOT_FOUND),
      );

      await expect(
        controller.update('nonexistent', { name: 'X' }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('delete', () => {
    it('should delete an organization and return success message', async () => {
      mockOrganizationsService.delete.mockResolvedValue(undefined);

      const result = await controller.delete('test-org');

      expect(result.message).toBe('Organization deleted successfully');
      expect(mockOrganizationsService.delete).toHaveBeenCalledWith('test-org');
    });

    it('should propagate NOT_FOUND errors from service', async () => {
      mockOrganizationsService.delete.mockRejectedValue(
        new HttpException('Organization not found', HttpStatus.NOT_FOUND),
      );

      await expect(controller.delete('nonexistent')).rejects.toThrow(
        HttpException,
      );
    });

    it('should propagate CONFLICT errors when org has agents', async () => {
      mockOrganizationsService.delete.mockRejectedValue(
        new HttpException('Cannot delete org with agents', HttpStatus.CONFLICT),
      );

      await expect(controller.delete('test-org')).rejects.toThrow(
        HttpException,
      );
    });
  });
});
