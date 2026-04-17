import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  applyInProcessAuthOverrides as applyAuthOverrides,
  resetAuthMocks,
} from '@orchestratorai/auth-client/testing';
import { LegalJobsController } from './legal-jobs.controller';
import { LegalJobsRepository } from './legal-jobs.repository';
import { LegalCapabilityConfigRepository } from './legal-capability-config.repository';
import { LegalDocumentsStorageService } from './legal-documents-storage.service';
import { DealMemoArtifactService } from '../workflows/deal-memo/artifacts/deal-memo-artifact.service';
import { LegalDepartmentService } from '../legal-department.service';
import { DocumentExtractionRouter } from '@orchestratorai/planes/extractors';
import type { ComparisonResult } from './legal-jobs.types';
import { AdminLookupService } from './admin-lookup.service';
import { ObservabilityService } from '../../shared/services/observability.service';

const ctx = {
  orgSlug: 'org-a',
  userId: 'user-1',
  conversationId: 'compare-test',
  agentSlug: 'legal-department',
  agentType: 'langgraph',
  provider: 'ollama',
  model: 'gemma4:e4b',
};

const ZERO_SEVERITY = { critical: 0, high: 0, medium: 0, low: 0 };
const ZERO_BY_CATEGORY = {
  contractual: { ...ZERO_SEVERITY },
  ip: { ...ZERO_SEVERITY },
  employment: { ...ZERO_SEVERITY },
  regulatory: { ...ZERO_SEVERITY },
  financial: { ...ZERO_SEVERITY },
  corporate: { ...ZERO_SEVERITY },
  environmental: { ...ZERO_SEVERITY },
};

function makeRepoMock(): jest.Mocked<LegalJobsRepository> {
  return {
    insertQueued: jest.fn(),
    findByIdForOrg: jest.fn(),
    listForOrg: jest.fn().mockResolvedValue([]),
    claimNextQueued: jest.fn(),
    updateProgress: jest.fn(),
    updateOriginalFilePath: jest.fn(),
    markCompleted: jest.fn(),
    markFailed: jest.fn(),
    markAwaitingReview: jest.fn(),
    clearReviewDecision: jest.fn(),
    recordReviewAndRequeue: jest.fn(),
    listEventsForConversation: jest.fn().mockResolvedValue([]),
    listSpecialistKeysWithReasoning: jest.fn().mockResolvedValue([]),
    findReasoningForSpecialist: jest.fn().mockResolvedValue(null),
    updateDocumentPaths: jest.fn(),
    cancelJob: jest.fn(),
    deleteOlderThan: jest.fn().mockResolvedValue(0),
    addDocumentsToRoom: jest.fn(),
    updateAccessControl: jest.fn(),
  } as unknown as jest.Mocked<LegalJobsRepository>;
}

function makeLegalServiceMock(): jest.Mocked<LegalDepartmentService> {
  return {
    getGraph: jest.fn().mockReturnValue({
      getState: jest.fn().mockResolvedValue({ values: {} }),
    }),
    compareRooms: jest.fn(),
  } as unknown as jest.Mocked<LegalDepartmentService>;
}

function makeAdminLookupMock(): jest.Mocked<AdminLookupService> {
  return {
    isOrgAdmin: jest.fn().mockResolvedValue(false),
  } as unknown as jest.Mocked<AdminLookupService>;
}

function makeObservabilityMock(): jest.Mocked<ObservabilityService> {
  return {
    emit: jest.fn(),
    emitStarted: jest.fn(),
    emitProgress: jest.fn(),
    emitCompleted: jest.fn(),
    emitFailed: jest.fn(),
  } as unknown as jest.Mocked<ObservabilityService>;
}

async function makeController() {
  resetAuthMocks();
  const repo = makeRepoMock();
  const legalService = makeLegalServiceMock();
  const adminLookup = makeAdminLookupMock();
  const observability = makeObservabilityMock();

  const moduleRef: TestingModule = await applyAuthOverrides(
    Test.createTestingModule({
      controllers: [LegalJobsController],
      providers: [
        { provide: LegalJobsRepository, useValue: repo },
        { provide: LegalDepartmentService, useValue: legalService },
        { provide: AdminLookupService, useValue: adminLookup },
        { provide: ObservabilityService, useValue: observability },
        {
          provide: LegalCapabilityConfigRepository,
          useValue: {
            listForCapability: jest.fn().mockResolvedValue([]),
            findRow: jest.fn(),
            upsert: jest.fn(),
          },
        },
        {
          provide: DocumentExtractionRouter,
          useValue: { extract: jest.fn(), extractText: jest.fn() },
        },
        {
          provide: LegalDocumentsStorageService,
          useValue: { storeOriginal: jest.fn(), getSignedUrl: jest.fn() },
        },
        {
          provide: DealMemoArtifactService,
          useValue: {
            uploadMemoMarkdown: jest.fn(),
            downloadArtifact: jest.fn(),
            memoMarkdownPath: jest.fn(),
            onModuleInit: jest.fn(),
          },
        },
      ],
    }),
  ).compile();

  return {
    controller: moduleRef.get(LegalJobsController),
    repo,
    legalService,
    adminLookup,
  };
}

describe('LegalJobsController.compareRooms', () => {
  it('returns 400 for missing context', async () => {
    const { controller } = await makeController();
    await expect(
      controller.compareRooms({
        context: undefined as any,
        jobIds: ['a', 'b'],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns 400 for missing orgSlug', async () => {
    const { controller } = await makeController();
    await expect(
      controller.compareRooms({
        context: { ...ctx, orgSlug: '' },
        jobIds: ['a', 'b'],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns 400 for single jobId', async () => {
    const { controller } = await makeController();
    await expect(
      controller.compareRooms({ context: ctx, jobIds: ['only-one'] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns 400 for empty jobIds', async () => {
    const { controller } = await makeController();
    await expect(
      controller.compareRooms({ context: ctx, jobIds: [] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns 400 for more than 10 jobIds', async () => {
    const { controller } = await makeController();
    const ids = Array.from({ length: 11 }, (_, i) => `id-${i}`);
    await expect(
      controller.compareRooms({ context: ctx, jobIds: ids }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns 400 for non-array jobIds', async () => {
    const { controller } = await makeController();
    await expect(
      controller.compareRooms({
        context: ctx,
        jobIds: 'not-an-array' as any,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('delegates to service.compareRooms with resolved access', async () => {
    const { controller, legalService, adminLookup } = await makeController();
    const mockResult: ComparisonResult = {
      rooms: [],
      dealBreakers: [],
      missingDocuments: [],
    };
    legalService.compareRooms.mockResolvedValue(mockResult);

    const result = await controller.compareRooms({
      context: ctx,
      jobIds: ['job-1', 'job-2'],
    });

    expect(adminLookup.isOrgAdmin).toHaveBeenCalledWith('user-1', 'org-a');
    expect(legalService.compareRooms).toHaveBeenCalledWith(
      ['job-1', 'job-2'],
      { allowedForUserId: 'user-1', isAdmin: false },
      'org-a',
    );
    expect(result).toBe(mockResult);
  });

  it('propagates NotFoundException from service (non-existent job)', async () => {
    const { controller, legalService } = await makeController();
    legalService.compareRooms.mockRejectedValue(
      new NotFoundException('Job bad-id not found'),
    );
    await expect(
      controller.compareRooms({
        context: ctx,
        jobIds: ['bad-id', 'job-2'],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('propagates NotFoundException for non-DD job type', async () => {
    const { controller, legalService } = await makeController();
    legalService.compareRooms.mockRejectedValue(
      new NotFoundException('Job non-dd not found'),
    );
    await expect(
      controller.compareRooms({
        context: ctx,
        jobIds: ['non-dd', 'job-2'],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('propagates NotFoundException for inaccessible room', async () => {
    const { controller, legalService } = await makeController();
    legalService.compareRooms.mockRejectedValue(
      new NotFoundException('Job restricted not found'),
    );
    await expect(
      controller.compareRooms({
        context: ctx,
        jobIds: ['restricted', 'job-2'],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('successful 2-room comparison returns expected shape', async () => {
    const { controller, legalService } = await makeController();
    const mockResult: ComparisonResult = {
      rooms: [
        {
          jobId: 'job-1',
          targetCompany: 'Target A',
          transactionType: 'acquisition',
          jurisdictions: ['US'],
          status: 'completed',
          progress: 100,
          documentCount: 3,
          analyzedCount: 2,
          missingDocumentCount: 1,
          dealBreakerCount: 1,
          riskSummary: {
            byCategory: {
              ...ZERO_BY_CATEGORY,
              contractual: { critical: 0, high: 2, medium: 0, low: 1 },
              financial: { critical: 1, high: 0, medium: 0, low: 0 },
            },
            totalBySeverity: { critical: 1, high: 2, medium: 0, low: 1 },
          },
          financialSummary: {
            'cap-table': {
              specialistKey: 'cap-table',
              overallRisk: 'medium',
              keyMetrics: [
                { label: 'Total Shares', value: 10000000 },
                { label: 'Option Pool %', value: 15 },
              ],
              findingCount: 1,
            },
          },
          completedAt: '2026-04-07T01:00:00Z',
        },
        {
          jobId: 'job-2',
          targetCompany: 'Target B',
          transactionType: 'acquisition',
          jurisdictions: ['US'],
          status: 'completed',
          progress: 100,
          documentCount: 0,
          analyzedCount: 0,
          missingDocumentCount: 0,
          dealBreakerCount: 0,
          riskSummary: {
            byCategory: { ...ZERO_BY_CATEGORY },
            totalBySeverity: { ...ZERO_SEVERITY },
          },
          financialSummary: {},
          completedAt: '2026-04-07T01:00:00Z',
        },
      ],
      dealBreakers: [
        {
          jobId: 'job-1',
          targetCompany: 'Target A',
          finding: 'Missing key IP license',
          category: 'ip',
          reasoning: 'No license for core technology',
          recommendation: 'Negotiate IP license before close',
        },
      ],
      missingDocuments: [
        {
          jobId: 'job-1',
          targetCompany: 'Target A',
          description: 'Audit letter 2025',
          importance: 'high',
        },
      ],
    };
    legalService.compareRooms.mockResolvedValue(mockResult);

    const result = await controller.compareRooms({
      context: ctx,
      jobIds: ['job-1', 'job-2'],
    });

    expect(result.rooms).toHaveLength(2);
    expect(result.rooms[0]!.jobId).toBe('job-1');
    expect(result.rooms[0]!.riskSummary.totalBySeverity.critical).toBe(1);
    expect(result.rooms[0]!.financialSummary['cap-table']).toBeDefined();
    expect(
      result.rooms[0]!.financialSummary['cap-table']!.keyMetrics,
    ).toHaveLength(2);
    expect(result.rooms[1]!.documentCount).toBe(0);
    expect(result.dealBreakers).toHaveLength(1);
    expect(result.dealBreakers[0]!.finding).toBe('Missing key IP license');
    expect(result.missingDocuments).toHaveLength(1);
  });

  it('handles rooms with no risk matrix (zero counts)', async () => {
    const { controller, legalService } = await makeController();
    const mockResult: ComparisonResult = {
      rooms: [
        {
          jobId: 'job-1',
          targetCompany: 'Target A',
          transactionType: 'merger',
          jurisdictions: [],
          status: 'processing',
          progress: 50,
          documentCount: 2,
          analyzedCount: 1,
          missingDocumentCount: 0,
          dealBreakerCount: 0,
          riskSummary: {
            byCategory: { ...ZERO_BY_CATEGORY },
            totalBySeverity: { ...ZERO_SEVERITY },
          },
          financialSummary: {},
          completedAt: null,
        },
        {
          jobId: 'job-2',
          targetCompany: 'Target B',
          transactionType: 'merger',
          jurisdictions: [],
          status: 'completed',
          progress: 100,
          documentCount: 5,
          analyzedCount: 5,
          missingDocumentCount: 0,
          dealBreakerCount: 0,
          riskSummary: {
            byCategory: { ...ZERO_BY_CATEGORY },
            totalBySeverity: { ...ZERO_SEVERITY },
          },
          financialSummary: {},
          completedAt: '2026-04-07T01:00:00Z',
        },
      ],
      dealBreakers: [],
      missingDocuments: [],
    };
    legalService.compareRooms.mockResolvedValue(mockResult);

    const result = await controller.compareRooms({
      context: ctx,
      jobIds: ['job-1', 'job-2'],
    });

    expect(result.rooms[0]!.riskSummary.totalBySeverity.critical).toBe(0);
    expect(result.rooms[0]!.dealBreakerCount).toBe(0);
    expect(result.rooms[0]!.completedAt).toBeNull();
    expect(result.rooms[1]!.status).toBe('completed');
    expect(result.dealBreakers).toHaveLength(0);
  });
});
