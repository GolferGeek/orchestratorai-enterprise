import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import {
  applyInProcessAuthOverrides as applyAuthOverrides,
  resetAuthMocks,
} from '@orchestratorai/auth-client/testing';
import { MAX_INPUT_TOKENS } from '../services/token-count.util';
import { LegalJobsController } from './legal-jobs.controller';
import { LegalJobsRepository } from './legal-jobs.repository';
import { LegalCapabilityConfigRepository } from './legal-capability-config.repository';
import { LegalDocumentsStorageService } from './legal-documents-storage.service';
import { DealMemoArtifactService } from '../workflows/deal-memo/artifacts/deal-memo-artifact.service';
import { LegalDepartmentService } from '../legal-department.service';
import { DocumentExtractionRouter } from '@orchestratorai/planes/extractors';
import { AgentJobRow } from './legal-jobs.types';
import { AdminLookupService } from './admin-lookup.service';
import { ObservabilityService } from '../../shared/services/observability.service';

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
  access_control: { mode: 'open' },
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
    listSpecialistKeysWithReasoning: jest.fn().mockResolvedValue([]),
    findReasoningForSpecialist: jest.fn().mockResolvedValue(null),
    updateDocumentPaths: jest.fn().mockResolvedValue(undefined),
    cancelJob: jest.fn(),
    deleteOlderThan: jest.fn().mockResolvedValue(0),
    addDocumentsToRoom: jest.fn(),
    updateAccessControl: jest.fn().mockResolvedValue(sampleRow),
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

function makeAdminLookupMock(): jest.Mocked<AdminLookupService> {
  return {
    isOrgAdmin: jest.fn().mockResolvedValue(false),
  } as unknown as jest.Mocked<AdminLookupService>;
}

function makeDealMemoArtifactMock(): jest.Mocked<DealMemoArtifactService> {
  return {
    uploadMemoMarkdown: jest.fn(),
    uploadMemoDocx: jest.fn(),
    downloadArtifact: jest.fn().mockResolvedValue({
      data: Buffer.from('artifact-bytes'),
      contentType: 'text/markdown; charset=utf-8',
    }),
    renderMarkdownToDocx: jest.fn(),
    memoMarkdownPath: jest.fn(),
    memoDocxPath: jest.fn(),
    onModuleInit: jest.fn(),
  } as unknown as jest.Mocked<DealMemoArtifactService>;
}

function makeObservabilityMock(): jest.Mocked<ObservabilityService> {
  return {
    emit: jest.fn().mockResolvedValue(undefined),
    emitStarted: jest.fn().mockResolvedValue(undefined),
    emitProgress: jest.fn().mockResolvedValue(undefined),
    emitCompleted: jest.fn().mockResolvedValue(undefined),
    emitFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ObservabilityService>;
}

async function makeController() {
  resetAuthMocks();
  const repo = makeRepoMock();
  const capabilityConfig = makeCapabilityConfigMock();
  const extractor = makeExtractorMock();
  const documentsStorage = makeDocumentsStorageMock();
  const legalService = makeLegalServiceMock();
  const dealMemoArtifact = makeDealMemoArtifactMock();
  const adminLookup = makeAdminLookupMock();
  const observabilityMock = makeObservabilityMock();
  const moduleRef: TestingModule = await applyAuthOverrides(
    Test.createTestingModule({
      controllers: [LegalJobsController],
      providers: [
        { provide: LegalJobsRepository, useValue: repo },
        {
          provide: LegalCapabilityConfigRepository,
          useValue: capabilityConfig,
        },
        { provide: DocumentExtractionRouter, useValue: extractor },
        { provide: LegalDocumentsStorageService, useValue: documentsStorage },
        { provide: LegalDepartmentService, useValue: legalService },
        { provide: DealMemoArtifactService, useValue: dealMemoArtifact },
        { provide: AdminLookupService, useValue: adminLookup },
        { provide: ObservabilityService, useValue: observabilityMock },
      ],
    }),
  ).compile();
  return {
    controller: moduleRef.get(LegalJobsController),
    repo,
    capabilityConfig,
    extractor,
    documentsStorage,
    legalService,
    dealMemoArtifact,
    adminLookup,
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
        controller.list(
          undefined,
          undefined,
          undefined,
          'user-1',
          undefined,
          undefined,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects unknown status filter', async () => {
      const { controller } = await makeController();
      await expect(
        controller.list(
          'org-a',
          'gibberish',
          undefined,
          'user-1',
          undefined,
          undefined,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('passes valid filters through to the repository', async () => {
      const { controller, repo } = await makeController();
      const result = await controller.list(
        'org-a',
        'queued',
        undefined,
        'user-1',
        '10',
        '0',
      );
      expect(result.jobs).toHaveLength(1);
      expect(repo.listForOrg).toHaveBeenCalledWith('org-a', {
        status: 'queued',
        limit: 10,
        offset: 0,
        allowedForUserId: 'user-1',
        isAdmin: false,
      });
    });
  });

  describe('GET /legal-department/jobs/:id', () => {
    it('returns 404 when row not in caller org', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValueOnce(null);
      await expect(
        controller.get('job-x', 'org-a', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the row when present', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValueOnce(sampleRow);
      const result = await controller.get('job-1', 'org-a', 'user-1');
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

    // ── Phase 3: deal-memo reuses the generic /review path ──────────────
    it('records approve/reject/modify on a deal-memo job (job_type=deal-memo-generation)', async () => {
      const { controller, repo } = await makeController();
      const memoAwaitingRow: AgentJobRow = {
        ...awaitingRow,
        job_type: 'deal-memo-generation',
        input: {
          data: {
            parentJobId: 'dd-parent-1',
            parentConversationId: 'dd-parent-conv-1',
            dealStructure: 'stock-purchase',
          },
          metadata: { jobType: 'deal-memo-generation' },
        },
      };
      repo.findByIdForOrg.mockResolvedValue(memoAwaitingRow);
      repo.recordReviewAndRequeue.mockResolvedValue({
        ...memoAwaitingRow,
        status: 'queued',
      });

      // approve
      let result = await controller.review('job-1', {
        context: ctx,
        decision: { decision: 'approve' },
      });
      expect(result).toEqual({ jobId: 'job-1', status: 'queued' });

      // reject with feedback
      result = await controller.review('job-1', {
        context: ctx,
        decision: { decision: 'reject', feedback: 'tighten reps on IP' },
      });
      expect(result.status).toBe('queued');

      // modify with editedOutputs
      result = await controller.review('job-1', {
        context: ctx,
        decision: {
          decision: 'modify',
          editedOutputs: {
            'reps-warranties': {
              draft: 'SENTINEL-EDIT',
              citations: [{ documentId: 'doc-1', excerpt: 'MSA' }],
            },
          },
        },
      });
      expect(result.status).toBe('queued');

      expect(repo.recordReviewAndRequeue).toHaveBeenCalledTimes(3);
    });
  });

  describe('GET /legal-department/jobs/:id — memo awaiting_review payload', () => {
    it('surfaces memoMarkdown + sectionDrafts + sectionCitations for a deal-memo job', async () => {
      const { controller, repo, legalService } = await makeController();
      const memoAwaitingRow: AgentJobRow = {
        ...sampleRow,
        id: 'memo-job-1',
        status: 'awaiting_review',
        job_type: 'deal-memo-generation',
        input: {
          data: {},
          metadata: { jobType: 'deal-memo-generation' },
        },
      };
      repo.findByIdForOrg.mockResolvedValueOnce(memoAwaitingRow);

      const memoState = {
        memoMarkdown: '# Deal Memo — Target Inc',
        dealStructure: 'stock-purchase',
        sectionDrafts: {
          'reps-warranties': {
            draft: 'reps',
            citations: [{ documentId: 'doc-1', excerpt: 'MSA' }],
          },
          indemnification: {
            draft: 'indem',
            citations: [{ findingId: 'contract:0', excerpt: 'x' }],
          },
        },
      };
      (legalService.getGraph as jest.Mock).mockReturnValue({
        getState: jest.fn().mockResolvedValue({ values: memoState }),
      });

      const result = (await controller.get(
        'memo-job-1',
        'org-a',
        'user-1',
      )) as unknown as {
        reviewPayload: {
          gate: string;
          dealStructure: string;
          memoMarkdown: string;
          sectionDrafts: Record<string, { draft: string }>;
          sectionCitations: Record<string, unknown[]>;
        };
      };

      expect(legalService.getGraph).toHaveBeenCalledWith(
        'deal-memo-generation',
      );
      expect(result.reviewPayload.gate).toBe('deal-memo');
      expect(result.reviewPayload.dealStructure).toBe('stock-purchase');
      expect(result.reviewPayload.memoMarkdown).toContain('Deal Memo');
      expect(result.reviewPayload.sectionDrafts['reps-warranties']?.draft).toBe(
        'reps',
      );
      expect(
        result.reviewPayload.sectionCitations['indemnification'],
      ).toHaveLength(1);
    });
  });

  describe('GET /legal-department/jobs/:id/events', () => {
    it('404s when job not in caller org', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValueOnce(null);
      await expect(
        controller.events('job-x', 'org-a', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns events for the row conversation_id', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValueOnce(sampleRow);
      const result = await controller.events('job-1', 'org-a', 'user-1');
      expect(result.events).toHaveLength(1);
      expect(repo.listEventsForConversation).toHaveBeenCalledWith('conv-1');
    });
  });

  // ── Phase 4: GET /legal-department/jobs/:id/reasoning ─────────────────────

  describe('GET /legal-department/jobs/:id/reasoning', () => {
    describe('probe mode (no specialistKey)', () => {
      it('returns 200 with specialistKeys array', async () => {
        const { controller, repo } = await makeController();
        repo.findByIdForOrg.mockResolvedValueOnce(sampleRow);
        repo.listSpecialistKeysWithReasoning.mockResolvedValueOnce([
          'contract',
          'compliance',
        ]);

        const result = await controller.reasoning(
          'job-1',
          'org-a',
          'user-1',
          undefined,
        );

        expect(result).toEqual({
          jobId: 'job-1',
          specialistKeys: ['contract', 'compliance'],
        });
        expect(repo.listSpecialistKeysWithReasoning).toHaveBeenCalledWith(
          'job-1',
          'org-a',
        );
      });

      it('returns 200 with empty specialistKeys when no reasoning was captured', async () => {
        const { controller, repo } = await makeController();
        repo.findByIdForOrg.mockResolvedValueOnce(sampleRow);
        repo.listSpecialistKeysWithReasoning.mockResolvedValueOnce([]);

        const result = await controller.reasoning(
          'job-1',
          'org-a',
          'user-1',
          undefined,
        );

        expect(result).toEqual({ jobId: 'job-1', specialistKeys: [] });
      });

      it('returns 404 when job does not belong to orgSlug', async () => {
        const { controller, repo } = await makeController();
        repo.findByIdForOrg.mockResolvedValueOnce(null);

        await expect(
          controller.reasoning('job-1', 'other-org', 'user-1', undefined),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(repo.listSpecialistKeysWithReasoning).not.toHaveBeenCalled();
      });
    });

    describe('fetch mode (with specialistKey)', () => {
      it('returns 200 with thinkingContent when reasoning exists', async () => {
        const { controller, repo } = await makeController();
        repo.findByIdForOrg.mockResolvedValueOnce(sampleRow);
        repo.findReasoningForSpecialist.mockResolvedValueOnce({
          thinkingContent: 'analysing the indemnification clause…',
          thinkingDurationMs: 900,
          thinkingTokenCount: 35,
        });

        const result = await controller.reasoning(
          'job-1',
          'org-a',
          'user-1',
          'contract',
        );

        expect(result).toEqual({
          jobId: 'job-1',
          specialistKey: 'contract',
          thinkingContent: 'analysing the indemnification clause…',
          thinkingDurationMs: 900,
          thinkingTokenCount: 35,
        });
        expect(repo.findReasoningForSpecialist).toHaveBeenCalledWith(
          'job-1',
          'org-a',
          'contract',
        );
      });

      it('returns 404 when no reasoning was captured for the specialist', async () => {
        const { controller, repo } = await makeController();
        repo.findByIdForOrg.mockResolvedValueOnce(sampleRow);
        repo.findReasoningForSpecialist.mockResolvedValueOnce(null);

        await expect(
          controller.reasoning('job-1', 'org-a', 'user-1', 'compliance'),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it('returns 404 when job does not belong to orgSlug (fetch mode)', async () => {
        const { controller, repo } = await makeController();
        repo.findByIdForOrg.mockResolvedValueOnce(null);

        await expect(
          controller.reasoning('job-1', 'wrong-org', 'user-1', 'contract'),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(repo.findReasoningForSpecialist).not.toHaveBeenCalled();
      });
    });

    it('returns 400 when orgSlug is missing', async () => {
      const { controller } = await makeController();
      await expect(
        controller.reasoning('job-1', undefined, 'user-1', undefined),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('POST /jobs/:id/cancel', () => {
    it('cancels a queued job immediately', async () => {
      const { controller, repo } = await makeController();
      repo.cancelJob.mockResolvedValue('canceled');
      const result = await controller.cancelJob('job-1', undefined, {
        context: { orgSlug: 'org-a' },
      });
      expect(result).toEqual({ success: true, status: 'canceled' });
      expect(repo.cancelJob).toHaveBeenCalledWith('job-1', 'org-a');
    });

    it('requests cancellation for a processing job', async () => {
      const { controller, repo } = await makeController();
      repo.cancelJob.mockResolvedValue('cancel_requested');
      const result = await controller.cancelJob('job-1', undefined, {
        context: { orgSlug: 'org-a' },
      });
      expect(result).toEqual({ success: true, status: 'cancel_requested' });
    });

    it('returns 409 for a completed job', async () => {
      const { controller, repo } = await makeController();
      repo.cancelJob.mockRejectedValue(
        new ConflictException(
          'Job cannot be canceled in current status: completed',
        ),
      );
      await expect(
        controller.cancelJob('job-1', undefined, {
          context: { orgSlug: 'org-a' },
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns 400 when orgSlug is missing', async () => {
      const { controller } = await makeController();
      await expect(
        controller.cancelJob('job-1', undefined, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── Add Documents ──────────────────────────────────────────────────

  describe('POST /legal-department/jobs/:id/add-documents', () => {
    const completedDDRow: AgentJobRow = {
      ...sampleRow,
      id: 'dd-job-1',
      status: 'completed',
      job_type: 'due-diligence',
      document_count: 5,
      document_paths: ['dd-job-1/0-doc.pdf'],
      conversation_id: 'dd-conv-1',
      input: {
        data: { content: 'test' },
        metadata: { jobType: 'due-diligence' },
      },
      result: { report: 'existing report' },
      completed_at: '2026-04-13T00:00:00Z',
    };

    const testFile = {
      fieldname: 'files',
      originalname: 'new-doc.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      buffer: Buffer.from('test content'),
      size: 12,
    } as Express.Multer.File;

    it('returns 202 for a completed DD room', async () => {
      const { controller, repo, legalService } = await makeController();
      repo.findByIdForOrg.mockResolvedValue(completedDDRow);
      (legalService as any).addDocumentsToThread = jest
        .fn()
        .mockResolvedValue({ newDocumentIds: ['doc-006'] });
      repo.addDocumentsToRoom = jest.fn().mockResolvedValue({
        ...completedDDRow,
        status: 'queued',
        document_count: 6,
      }) as any;

      const result = await controller.addDocuments(
        'dd-job-1',
        [testFile],
        'org-a',
        'user-1',
      );

      expect(result.jobId).toBe('dd-job-1');
      expect(result.status).toBe('processing');
      expect(result.newDocumentCount).toBe(1);
      expect(result.totalDocumentCount).toBe(6);
    });

    it('returns 409 when job is not completed', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValue({
        ...completedDDRow,
        status: 'processing',
      });

      await expect(
        controller.addDocuments('dd-job-1', [testFile], 'org-a', 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns 400 when job is not a DD room', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValue({
        ...completedDDRow,
        job_type: 'document-analysis',
        input: {
          data: { content: 'test' },
          metadata: { jobType: 'document-analysis' },
        },
      });

      await expect(
        controller.addDocuments('dd-job-1', [testFile], 'org-a', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns 404 when job does not exist', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValue(null);

      await expect(
        controller.addDocuments('nonexistent', [testFile], 'org-a', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 400 when no files provided', async () => {
      const { controller } = await makeController();

      await expect(
        controller.addDocuments('dd-job-1', undefined, 'org-a', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns 400 when orgSlug missing', async () => {
      const { controller } = await makeController();

      await expect(
        controller.addDocuments('dd-job-1', [testFile], undefined, 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('POST /legal-department/jobs/:id/generate-deal-memo', () => {
    const completedDDRow: AgentJobRow = {
      ...sampleRow,
      id: 'dd-job-1',
      conversation_id: 'dd-conv-1',
      job_type: 'document-analysis',
      status: 'completed',
      progress: 100,
      completed_at: '2026-04-14T00:00:00Z',
      input: {
        data: { content: 'dd' },
        metadata: { jobType: 'due-diligence' },
      },
      result: { report: 'done' },
    };

    const memoRow: AgentJobRow = {
      ...sampleRow,
      id: 'memo-job-1',
      conversation_id: 'memo-conv-1',
      job_type: 'document-analysis', // DB column (real type in metadata.jobType)
      status: 'queued',
    };

    it('enqueues a memo job on the happy path', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValue(completedDDRow);
      repo.insertQueued.mockResolvedValue(memoRow);

      const result = await controller.generateDealMemo('dd-job-1', {
        context: ctx,
        dealStructure: 'stock-purchase',
      });

      expect(result).toEqual({
        jobId: 'memo-job-1',
        conversationId: 'memo-conv-1',
        status: 'queued',
      });
      expect(repo.findByIdForOrg).toHaveBeenCalledWith('dd-job-1', 'org-a', {
        allowedForUserId: 'user-1',
        isAdmin: false,
      });
      expect(repo.insertQueued).toHaveBeenCalledTimes(1);

      const insertArgs = repo.insertQueued.mock.calls[0]!;
      const enqueueRequest = insertArgs[0] as {
        data: Record<string, unknown>;
        metadata: Record<string, unknown>;
      };
      expect(enqueueRequest.data.parentJobId).toBe('dd-job-1');
      expect(enqueueRequest.data.parentConversationId).toBe('dd-conv-1');
      expect(enqueueRequest.data.dealStructure).toBe('stock-purchase');
      expect(enqueueRequest.metadata.jobType).toBe('deal-memo-generation');
    });

    it('returns 404 when parent DD job is missing', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValue(null);

      await expect(
        controller.generateDealMemo('missing', {
          context: ctx,
          dealStructure: 'stock-purchase',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.insertQueued).not.toHaveBeenCalled();
    });

    it('returns 409 when parent is not a DD room', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValue({
        ...completedDDRow,
        input: {
          data: { content: 'x' },
          metadata: { jobType: 'legal-research' },
        },
      });

      await expect(
        controller.generateDealMemo('not-dd', {
          context: ctx,
          dealStructure: 'stock-purchase',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.insertQueued).not.toHaveBeenCalled();
    });

    it('returns 409 when parent DD room is not completed', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValue({
        ...completedDDRow,
        status: 'processing',
      });

      await expect(
        controller.generateDealMemo('in-progress', {
          context: ctx,
          dealStructure: 'stock-purchase',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.insertQueued).not.toHaveBeenCalled();
    });

    it('rejects cross-org callers via repo.findByIdForOrg (returns 404)', async () => {
      const { controller, repo } = await makeController();
      // findByIdForOrg filters by org_slug — if caller is in a different org,
      // the repo returns null and the controller issues 404.
      repo.findByIdForOrg.mockResolvedValue(null);

      await expect(
        controller.generateDealMemo('dd-job-1', {
          context: { ...ctx, orgSlug: 'other-org' },
          dealStructure: 'stock-purchase',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.findByIdForOrg).toHaveBeenCalledWith(
        'dd-job-1',
        'other-org',
        { allowedForUserId: 'user-1', isAdmin: false },
      );
    });

    it('rejects missing context', async () => {
      const { controller } = await makeController();
      await expect(
        controller.generateDealMemo('dd-job-1', {
          dealStructure: 'stock-purchase',
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects wildcard orgSlug', async () => {
      const { controller } = await makeController();
      await expect(
        controller.generateDealMemo('dd-job-1', {
          context: { ...ctx, orgSlug: '*' },
          dealStructure: 'stock-purchase',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects unknown dealStructure', async () => {
      const { controller, repo } = await makeController();
      await expect(
        controller.generateDealMemo('dd-job-1', {
          context: ctx,
          dealStructure: 'joint-venture' as never,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.findByIdForOrg).not.toHaveBeenCalled();
    });

    it('rejects missing dealStructure', async () => {
      const { controller } = await makeController();
      await expect(
        controller.generateDealMemo('dd-job-1', {
          context: ctx,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── Phase 4: deal-memo artifact endpoints + list filter ────────────

  describe('GET /legal-department/jobs (parentJobId + jobType filter)', () => {
    it('passes parentJobId and jobType through to the repository', async () => {
      const { controller, repo } = await makeController();
      await controller.list(
        'org-a',
        undefined,
        undefined,
        'user-1',
        undefined,
        undefined,
        'deal-memo-generation',
        'dd-job-1',
      );
      expect(repo.listForOrg).toHaveBeenCalledWith('org-a', {
        status: undefined,
        userId: undefined,
        limit: undefined,
        offset: undefined,
        jobType: 'deal-memo-generation',
        parentJobId: 'dd-job-1',
        allowedForUserId: 'user-1',
        isAdmin: false,
      });
    });

    it('still requires orgSlug', async () => {
      const { controller } = await makeController();
      await expect(
        controller.list(
          undefined,
          undefined,
          undefined,
          'user-1',
          undefined,
          undefined,
          'deal-memo-generation',
          'dd-job-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('omits the filters when not supplied (back-compat)', async () => {
      const { controller, repo } = await makeController();
      await controller.list(
        'org-a',
        undefined,
        undefined,
        'user-1',
        undefined,
        undefined,
        undefined,
        undefined,
      );
      expect(repo.listForOrg).toHaveBeenCalledWith('org-a', {
        status: undefined,
        userId: undefined,
        limit: undefined,
        offset: undefined,
        jobType: undefined,
        parentJobId: undefined,
        allowedForUserId: 'user-1',
        isAdmin: false,
      });
    });
  });

  describe('GET /legal-department/jobs/:id/deal-memo', () => {
    const completedMemo: AgentJobRow = {
      ...sampleRow,
      id: 'memo-99',
      conversation_id: 'memo-99-conv',
      status: 'completed',
      input: {
        data: {
          content: '',
          parentJobId: 'dd-99',
          parentConversationId: 'dd-99-conv',
          dealStructure: 'asset-purchase',
        },
        metadata: { jobType: 'deal-memo-generation' },
      },
      result: {
        memoMarkdown: '# Deal Memo — Target Inc',
        sectionCitations: { 'reps-warranties': [{ excerpt: 'x' }] },
        artifactPath: 'memo-99-conv/deal-memo.md',
        docxArtifactPath: 'memo-99-conv/deal-memo.docx',
      },
    };

    it('returns memoMarkdown, citations, paths, dealStructure, parentJobId on happy path', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValue(completedMemo);
      const result = await controller.getDealMemo('memo-99', 'org-a', 'user-1');
      expect(result).toEqual({
        jobId: 'memo-99',
        status: 'completed',
        memoMarkdown: '# Deal Memo — Target Inc',
        sectionCitations: { 'reps-warranties': [{ excerpt: 'x' }] },
        artifactPath: 'memo-99-conv/deal-memo.md',
        docxArtifactPath: 'memo-99-conv/deal-memo.docx',
        dealStructure: 'asset-purchase',
        parentJobId: 'dd-99',
      });
    });

    it('returns 400 when orgSlug is missing', async () => {
      const { controller } = await makeController();
      await expect(
        controller.getDealMemo('memo-99', undefined, 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns 404 when row is missing in caller org', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValue(null);
      await expect(
        controller.getDealMemo('memo-99', 'org-a', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 409 when row is not a deal-memo job', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValue({
        ...completedMemo,
        input: {
          ...completedMemo.input,
          metadata: { jobType: 'due-diligence' },
        },
      });
      await expect(
        controller.getDealMemo('memo-99', 'org-a', 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns 409 when memo is not completed', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValue({
        ...completedMemo,
        status: 'awaiting_review',
      });
      await expect(
        controller.getDealMemo('memo-99', 'org-a', 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns 409 when result.memoMarkdown is missing on a completed row (fail loud)', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValue({
        ...completedMemo,
        result: { sectionCitations: {} },
      });
      await expect(
        controller.getDealMemo('memo-99', 'org-a', 'user-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('GET /legal-department/jobs/:id/deal-memo/download', () => {
    const completedMemo: AgentJobRow = {
      ...sampleRow,
      id: 'memo-7',
      conversation_id: 'memo-7-conv',
      status: 'completed',
      input: {
        data: {
          content: '',
          parentJobId: 'dd-7',
          parentConversationId: 'dd-7-conv',
          dealStructure: 'merger',
        },
        metadata: { jobType: 'deal-memo-generation' },
      },
      result: {
        memoMarkdown: '# Memo',
        sectionCitations: {},
        artifactPath: 'memo-7-conv/deal-memo.md',
        docxArtifactPath: 'memo-7-conv/deal-memo.docx',
      },
    };

    function makeRes() {
      return {
        setHeader: jest.fn(),
        end: jest.fn(),
      } as unknown as import('express').Response & {
        setHeader: jest.Mock;
        end: jest.Mock;
      };
    }

    it('streams the MD artifact with text/markdown content type and attachment disposition', async () => {
      const { controller, repo, dealMemoArtifact } = await makeController();
      repo.findByIdForOrg.mockResolvedValue(completedMemo);
      dealMemoArtifact.downloadArtifact.mockResolvedValueOnce({
        data: Buffer.from('# Memo\n\nbody'),
        contentType: 'text/markdown; charset=utf-8',
      });
      const res = makeRes();
      await controller.downloadDealMemo('memo-7', 'org-a', 'user-1', 'md', res);
      expect(dealMemoArtifact.downloadArtifact).toHaveBeenCalledWith(
        'memo-7-conv/deal-memo.md',
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/markdown',
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="deal-memo-memo-7.md"',
      );
      expect(res.end).toHaveBeenCalledWith(Buffer.from('# Memo\n\nbody'));
    });

    it('streams the DOCX artifact with the openxml content type', async () => {
      const { controller, repo, dealMemoArtifact } = await makeController();
      repo.findByIdForOrg.mockResolvedValue(completedMemo);
      dealMemoArtifact.downloadArtifact.mockResolvedValueOnce({
        data: Buffer.from('PKxx'),
        contentType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const res = makeRes();
      await controller.downloadDealMemo(
        'memo-7',
        'org-a',
        'user-1',
        'docx',
        res,
      );
      expect(dealMemoArtifact.downloadArtifact).toHaveBeenCalledWith(
        'memo-7-conv/deal-memo.docx',
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="deal-memo-memo-7.docx"',
      );
    });

    it('returns 400 for unknown format', async () => {
      const { controller } = await makeController();
      await expect(
        controller.downloadDealMemo(
          'memo-7',
          'org-a',
          'user-1',
          'pdf',
          makeRes(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns 400 when format is missing', async () => {
      const { controller } = await makeController();
      await expect(
        controller.downloadDealMemo(
          'memo-7',
          'org-a',
          'user-1',
          undefined,
          makeRes(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns 400 when orgSlug is missing', async () => {
      const { controller } = await makeController();
      await expect(
        controller.downloadDealMemo(
          'memo-7',
          undefined,
          'user-1',
          'md',
          makeRes(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns 404 when row is missing in caller org (cross-org safety)', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValue(null);
      await expect(
        controller.downloadDealMemo(
          'memo-7',
          'other-org',
          'user-1',
          'md',
          makeRes(),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 409 when row is not a deal-memo job', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValue({
        ...completedMemo,
        input: {
          ...completedMemo.input,
          metadata: { jobType: 'compliance-audit' },
        },
      });
      await expect(
        controller.downloadDealMemo(
          'memo-7',
          'org-a',
          'user-1',
          'md',
          makeRes(),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns 409 when memo is not completed yet', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValue({
        ...completedMemo,
        status: 'processing',
      });
      await expect(
        controller.downloadDealMemo(
          'memo-7',
          'org-a',
          'user-1',
          'md',
          makeRes(),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns 404 when format is requested but the artifact path is missing', async () => {
      const { controller, repo } = await makeController();
      repo.findByIdForOrg.mockResolvedValue({
        ...completedMemo,
        result: { memoMarkdown: '# Memo', sectionCitations: {} },
      });
      await expect(
        controller.downloadDealMemo(
          'memo-7',
          'org-a',
          'user-1',
          'docx',
          makeRes(),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
