import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { MAX_INPUT_TOKENS } from '../services/token-count.util';
import { LegalJobsController } from './legal-jobs.controller';
import { LegalJobsRepository } from './legal-jobs.repository';
import { LegalCapabilityConfigRepository } from './legal-capability-config.repository';
import { LegalDocumentsStorageService } from './legal-documents-storage.service';
import { LegalDepartmentService } from '../legal-department.service';
import { DocumentExtractionRouter } from '@orchestratorai/planes/extractors';
import { AgentJobRow } from './legal-jobs.types';

const ctx = {
  orgSlug: 'org-a',
  userId: 'user-1',
  conversationId: 'caller-conv',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

const sampleRow: AgentJobRow = {
  id: 'job-1',
  org_slug: 'org-a',
  user_id: 'user-1',
  conversation_id: 'conv-1',
  agent_slug: 'legal-department',
  job_type: 'document-analysis',
  provider: 'ollama',
  model: 'gemma4:e4b',
  status: 'queued',
  current_step: null,
  progress: 0,
  last_message: null,
  error: null,
  input: { data: { content: 'hello' } },
  result: null,
  queued_at: '2026-04-07T00:00:00Z',
  started_at: null,
  completed_at: null,
  original_file_path: null,
  document_paths: [],
  document_count: 1,
  review_decision: null,
};

function makeRepoMock(): jest.Mocked<LegalJobsRepository> {
  return {
    insertQueued: jest.fn().mockResolvedValue(sampleRow),
    findByIdForOrg: jest.fn(),
    listForOrg: jest.fn().mockResolvedValue([sampleRow]),
    claimNextQueued: jest.fn(),
    updateProgress: jest.fn(),
    updateOriginalFilePath: jest.fn().mockResolvedValue(undefined),
    markCompleted: jest.fn(),
    markFailed: jest.fn(),
    markAwaitingReview: jest.fn().mockResolvedValue(undefined),
    clearReviewDecision: jest.fn().mockResolvedValue(undefined),
    recordReviewAndRequeue: jest.fn(),
    listEventsForConversation: jest.fn().mockResolvedValue([{ id: 1 }]),
  } as unknown as jest.Mocked<LegalJobsRepository>;
}

function makeLegalServiceMock(): jest.Mocked<LegalDepartmentService> {
  return {
    getGraph: jest.fn().mockReturnValue({
      getState: jest.fn().mockResolvedValue({ values: {} }),
    }),
  } as unknown as jest.Mocked<LegalDepartmentService>;
}

function makeCapabilityConfigMock(): jest.Mocked<LegalCapabilityConfigRepository> {
  return {
    listForCapability: jest.fn().mockResolvedValue([]),
    findRow: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({
      id: 'cfg-1',
      capability_slug: 'document-onboarding',
      role: 'workhorse',
      provider: 'ollama',
      model: 'gemma4:e4b',
      updated_at: '2026-04-07T00:00:00Z',
    }),
  } as unknown as jest.Mocked<LegalCapabilityConfigRepository>;
}

function makeExtractorMock(): jest.Mocked<DocumentExtractionRouter> {
  return {
    extract: jest.fn().mockResolvedValue({
      text: 'extracted',
      metadata: { extractor: 'text' },
    }),
    extractText: jest.fn().mockResolvedValue('extracted'),
  } as unknown as jest.Mocked<DocumentExtractionRouter>;
}

function makeDocumentsStorageMock(): jest.Mocked<LegalDocumentsStorageService> {
  return {
    storeOriginal: jest.fn().mockResolvedValue('job-1/test-file.txt'),
    getSignedUrl: jest.fn().mockReturnValue('https://example.test/signed-url'),
  } as unknown as jest.Mocked<LegalDocumentsStorageService>;
}

async function makeController() {
  const repo = makeRepoMock();
  const capabilityConfig = makeCapabilityConfigMock();
  const extractor = makeExtractorMock();
  const documentsStorage = makeDocumentsStorageMock();
  const legalService = makeLegalServiceMock();
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [LegalJobsController],
    providers: [
      { provide: LegalJobsRepository, useValue: repo },
      { provide: LegalCapabilityConfigRepository, useValue: capabilityConfig },
      { provide: DocumentExtractionRouter, useValue: extractor },
      { provide: LegalDocumentsStorageService, useValue: documentsStorage },
      { provide: LegalDepartmentService, useValue: legalService },
    ],
  }).compile();
  return {
    controller: moduleRef.get(LegalJobsController),
    repo,
    capabilityConfig,
    extractor,
    documentsStorage,
    legalService,
  };
}

describe('LegalJobsController', () => {
  describe('POST /legal-department/jobs', () => {
    it('returns 202 with jobId + conversationId on success', async () => {
      const { controller, repo } = await makeController();
      const result = await controller.enqueue({
        context: ctx,
        data: { content: 'hello' },
      });
      expect(result).toEqual({
        jobId: 'job-1',
        conversationId: 'conv-1',
        status: 'queued',
      });
      expect(repo.insertQueued).toHaveBeenCalledTimes(1);
      // The server, not the caller, supplies a fresh conversationId.
      const passedConvId = (repo.insertQueued.mock.calls[0] as unknown[])[1];
      expect(typeof passedConvId).toBe('string');
      expect(passedConvId).not.toBe(ctx.conversationId);
    });

    it('rejects missing context', async () => {
      const { controller } = await makeController();
      await expect(
        controller.enqueue({ data: { content: 'hi' } } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects context missing required fields', async () => {
      const { controller } = await makeController();
      await expect(
        controller.enqueue({
          context: { ...ctx, orgSlug: '' } as never,
          data: { content: 'hi' },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects oversized input with PayloadTooLargeException (HTTP 413)', async () => {
      const { controller, repo } = await makeController();
      // Build content that exceeds MAX_INPUT_TOKENS. Each "word " is ~1
      // token under cl100k_base, so over-provision generously to be safe.
      const oversized = 'word '.repeat(MAX_INPUT_TOKENS + 1000);
      await expect(
        controller.enqueue({ context: ctx, data: { content: oversized } }),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);
      // The job should never have been inserted.
      expect(repo.insertQueued).not.toHaveBeenCalled();
    });

    it('rejects missing data.content', async () => {
      const { controller } = await makeController();
      await expect(
        controller.enqueue({
          context: ctx,
          data: {} as never,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('GET /legal-department/jobs', () => {
    it('requires orgSlug query param', async () => {
      const { controller } = await makeController();
      await expect(
        controller.list(undefined, undefined, undefined, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects unknown status filter', async () => {
      const { controller } = await makeController();
      await expect(
        controller.list('org-a', 'gibberish', undefined, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('passes valid filters through to the repository', async () => {
      const { controller, repo } = await makeController();
      const result = await controller.list('org-a', 'queued', '10', '0');
      expect(result.jobs).toHaveLength(1);
      expect(repo.listForOrg).toHaveBeenCalledWith('org-a', {
        status: 'queued',
        limit: 10,
        offset: 0,
      });
    });
  });

  describe('GET /legal-department/jobs/:id', () => {
    it('returns 404 when row not in caller org', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValueOnce(null);
      await expect(controller.get('job-x', 'org-a')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns the row when present', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValueOnce(sampleRow);
      const result = await controller.get('job-1', 'org-a');
      expect(result.id).toBe('job-1');
    });
  });

  describe('POST /legal-department/jobs/:id/review', () => {
    const awaitingRow: AgentJobRow = {
      ...sampleRow,
      status: 'awaiting_review',
    };

    it('records an approve decision and re-queues the row', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValueOnce(awaitingRow);
      repo.recordReviewAndRequeue.mockResolvedValueOnce({
        ...awaitingRow,
        status: 'queued',
      });
      const result = await controller.review('job-1', {
        context: ctx,
        decision: { decision: 'approve' },
      });
      expect(result).toEqual({ jobId: 'job-1', status: 'queued' });
      expect(repo.recordReviewAndRequeue).toHaveBeenCalledWith(
        'job-1',
        'org-a',
        { decision: 'approve' },
      );
    });

    it('returns 409 when job is not awaiting_review', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValueOnce({
        ...sampleRow,
        status: 'completed',
      });
      await expect(
        controller.review('job-1', {
          context: ctx,
          decision: { decision: 'approve' },
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.recordReviewAndRequeue).not.toHaveBeenCalled();
    });

    it('returns 409 when the guarded UPDATE races and returns null', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValueOnce(awaitingRow);
      repo.recordReviewAndRequeue.mockResolvedValueOnce(null);
      await expect(
        controller.review('job-1', {
          context: ctx,
          decision: { decision: 'approve' },
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects wildcard orgSlug', async () => {
      const { controller } = await makeController();
      await expect(
        controller.review('job-1', {
          context: { ...ctx, orgSlug: '*' },
          decision: { decision: 'approve' },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires feedback when decision=reject', async () => {
      const { controller } = await makeController();
      await expect(
        controller.review('job-1', {
          context: ctx,
          decision: { decision: 'reject' } as never,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires editedOutputs when decision=modify', async () => {
      const { controller } = await makeController();
      await expect(
        controller.review('job-1', {
          context: ctx,
          decision: { decision: 'modify' } as never,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns 404 when job not in caller org', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValueOnce(null);
      await expect(
        controller.review('job-x', {
          context: ctx,
          decision: { decision: 'approve' },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('GET /legal-department/jobs/:id/events', () => {
    it('404s when job not in caller org', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValueOnce(null);
      await expect(controller.events('job-x', 'org-a')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns events for the row conversation_id', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValueOnce(sampleRow);
      const result = await controller.events('job-1', 'org-a');
      expect(result.events).toHaveLength(1);
      expect(repo.listEventsForConversation).toHaveBeenCalledWith('conv-1');
    });
  });
});
