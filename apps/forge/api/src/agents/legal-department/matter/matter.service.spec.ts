import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MatterService } from './matter.service';
import type { MatterRepository } from './matter.repository';
import type { LegalJobsRepository } from '../jobs/legal-jobs.repository';
import type { LegalDocumentsStorageService } from '../jobs/legal-documents-storage.service';
import type { CreateMatterDto, MatterRow } from './matter.types';

const baseContext = {
  orgSlug: 'test-org',
  userId: 'user-1',
  conversationId: 'conv-1',
  agentSlug: 'legal-department',
  agentType: 'forge',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

function makeMatterRow(overrides: Partial<MatterRow> = {}): MatterRow {
  return {
    id: 'matter-1',
    org_slug: 'test-org',
    created_by: 'user-1',
    name: 'Smith v. Jones',
    client_name: 'Smith Corp',
    matter_type: 'litigation',
    jurisdiction: 'NY',
    opposing_parties: [],
    assigned_user_ids: [],
    status: 'active',
    description: null,
    opened_at: new Date().toISOString(),
    closed_at: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function buildService() {
  const matterRepo = {
    createMatter: jest.fn(),
    listMatters: jest.fn(),
    getMatterById: jest.fn(),
    updateMatter: jest.fn(),
    insertDocument: jest.fn(),
    listDocuments: jest.fn(),
    listEntities: jest.fn(),
    listTimeline: jest.fn(),
    assertMatterOwnership: jest.fn(),
  } as unknown as jest.Mocked<MatterRepository>;

  const jobsRepo = {
    insertQueued: jest.fn(),
    listForOrg: jest.fn(),
  } as unknown as jest.Mocked<LegalJobsRepository>;

  const storage = {
    storeOriginal: jest.fn(),
  } as unknown as jest.Mocked<LegalDocumentsStorageService>;

  const service = new MatterService(matterRepo, jobsRepo, storage);

  return { service, matterRepo, jobsRepo, storage };
}

describe('MatterService', () => {
  describe('createMatter', () => {
    it('delegates to repository', async () => {
      const { service, matterRepo } = buildService();
      const dto: CreateMatterDto = {
        context: baseContext,
        data: {
          name: 'Test',
          clientName: 'Client',
          matterType: 'litigation',
          jurisdiction: 'NY',
        },
      };
      const row = makeMatterRow();
      matterRepo.createMatter.mockResolvedValue(row);
      const result = await service.createMatter(dto);
      expect(result).toEqual(row);
      expect(matterRepo.createMatter).toHaveBeenCalledWith(dto);
    });
  });

  describe('listMatters', () => {
    it('returns matters for org', async () => {
      const { service, matterRepo } = buildService();
      matterRepo.listMatters.mockResolvedValue([makeMatterRow()]);
      const result = await service.listMatters('test-org');
      expect(result).toHaveLength(1);
    });
  });

  describe('uploadDocument', () => {
    it('stores file, inserts document, enqueues two jobs', async () => {
      const { service, matterRepo, jobsRepo, storage } = buildService();
      matterRepo.assertMatterOwnership.mockResolvedValue(makeMatterRow());
      matterRepo.insertDocument.mockResolvedValue({
        id: 'doc-1',
        matter_id: 'matter-1',
        org_slug: 'test-org',
        storage_path: 'p',
        original_name: 'test.pdf',
        document_class: null,
        document_date: null,
        parties: [],
        key_terms: [],
        summary: null,
        metadata: {},
        facts_processed: false,
        docs_processed: false,
        uploaded_at: '',
        uploaded_by: 'user-1',
      });
      storage.storeOriginal.mockResolvedValue(
        'matters/matter-1/documents/doc-1/test.pdf',
      );
      jobsRepo.insertQueued
        .mockResolvedValueOnce({ id: 'facts-job-1' } as never)
        .mockResolvedValueOnce({ id: 'docs-job-1' } as never);

      const file = {
        originalname: 'test.pdf',
        buffer: Buffer.from('content'),
        mimetype: 'application/pdf',
        size: 100,
      } as Express.Multer.File;

      const result = await service.uploadDocument(
        'matter-1',
        baseContext,
        file,
      );

      expect(storage.storeOriginal).toHaveBeenCalledTimes(1);
      expect(matterRepo.insertDocument).toHaveBeenCalledTimes(1);
      expect(jobsRepo.insertQueued).toHaveBeenCalledTimes(2);
      expect(result.factsJobId).toBe('facts-job-1');
      expect(result.docsJobId).toBe('docs-job-1');
    });

    it('rejects files over 50MB', async () => {
      const { service } = buildService();
      const file = {
        originalname: 'large.pdf',
        buffer: Buffer.alloc(0),
        mimetype: 'application/pdf',
        size: 51 * 1024 * 1024,
      } as Express.Multer.File;

      await expect(
        service.uploadDocument('matter-1', baseContext, file),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when matter belongs to different org', async () => {
      const { service, matterRepo } = buildService();
      matterRepo.assertMatterOwnership.mockRejectedValue(
        new ForbiddenException('forbidden'),
      );

      const file = {
        originalname: 'test.pdf',
        buffer: Buffer.from('x'),
        mimetype: 'application/pdf',
        size: 100,
      } as Express.Multer.File;

      await expect(
        service.uploadDocument(
          'matter-1',
          { ...baseContext, orgSlug: 'other-org' },
          file,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('listJobs', () => {
    it('filters jobs by matterId in input.data', async () => {
      const { service, matterRepo, jobsRepo } = buildService();
      matterRepo.getMatterById.mockResolvedValue(makeMatterRow());

      const matchingJob = {
        id: 'job-1',
        input: { data: { matterId: 'matter-1' } },
      };
      const nonMatchingJob = {
        id: 'job-2',
        input: { data: { matterId: 'other-matter' } },
      };

      jobsRepo.listForOrg
        .mockResolvedValueOnce([matchingJob] as never)
        .mockResolvedValueOnce([nonMatchingJob] as never);

      const result = await service.listJobs('matter-1', 'test-org');
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('job-1');
    });
  });
});
