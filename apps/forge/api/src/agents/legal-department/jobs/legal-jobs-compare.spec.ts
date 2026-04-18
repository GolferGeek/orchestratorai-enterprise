import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  applyRemoteAuthOverrides as applyAuthOverrides,
  resetAuthMocks,
} from '@orchestratorai/auth-client/testing';
import { LegalJobsController } from './legal-jobs.controller';
import { LegalJobsRepository } from './legal-jobs.repository';
import { LegalCapabilityConfigRepository } from './legal-capability-config.repository';
import { LegalDocumentsStorageService } from './legal-documents-storage.service';
import { DealMemoArtifactService } from '../workflows/deal-memo/artifacts/deal-memo-artifact.service';
import { LegalDepartmentService } from '../legal-department.service';
import { DocumentExtractionRouter } from '@orchestratorai/planes/extractors';
import type { ComparisonResult, AgentJobRow } from './legal-jobs.types';
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

  it('returns 400 for missing userId', async () => {
    const { controller } = await makeController();
    await expect(
      controller.compareRooms({
        context: { ...ctx, userId: '' },
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

  it('returns 400 for wildcard orgSlug', async () => {
    const { controller } = await makeController();
    await expect(
      controller.compareRooms({
        context: { ...ctx, orgSlug: '*' },
        jobIds: ['a', 'b'],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('LegalDepartmentService.compareRooms (real extraction)', () => {
  function makeDDRow(
    id: string,
    graphState: Record<string, unknown>,
  ): {
    row: AgentJobRow;
    state: Record<string, unknown>;
  } {
    return {
      row: {
        id,
        org_slug: 'org-a',
        user_id: 'user-1',
        conversation_id: `conv-${id}`,
        agent_slug: 'legal-department',
        job_type: 'due-diligence',
        provider: 'local',
        model: 'default',
        status: 'completed',
        current_step: null,
        progress: 100,
        last_message: null,
        error: null,
        input: {
          data: {
            content: '',
            dealContext: {
              transactionType: 'acquisition',
              targetCompany: `Target-${id}`,
              buyerCompany: 'Buyer',
              jurisdictions: ['US'],
            },
          },
          metadata: { jobType: 'due-diligence' },
        },
        result: null,
        queued_at: '2026-04-07T00:00:00Z',
        started_at: '2026-04-07T00:01:00Z',
        completed_at: '2026-04-07T01:00:00Z',
        original_file_path: null,
        document_paths: [],
        document_count: 3,
        review_decision: null,
        access_control: { mode: 'open' },
      } as AgentJobRow,
      state: graphState,
    };
  }

  function buildService(
    rows: Map<string, AgentJobRow>,
    states: Map<string, Record<string, unknown>>,
  ): LegalDepartmentService {
    const repo = {
      findByIdForOrg: jest.fn().mockImplementation((id: string) => {
        return Promise.resolve(rows.get(id) ?? null);
      }),
    };
    const graph = {
      getState: jest
        .fn()
        .mockImplementation(
          (config: { configurable: { thread_id: string } }) => {
            return Promise.resolve({
              values: states.get(config.configurable.thread_id) ?? {},
            });
          },
        ),
    };
    const service = {
      jobsRepository: repo,
      getGraph: jest.fn().mockReturnValue(graph),
    } as unknown as LegalDepartmentService;
    // Bind the real compareRooms (and private helpers) from the prototype
    const proto = LegalDepartmentService.prototype;
    service.compareRooms = proto.compareRooms.bind(service);
    (service as any).extractRiskSummary = (
      proto as any
    ).extractRiskSummary.bind(service);
    (service as any).extractFinancialSummary = (
      proto as any
    ).extractFinancialSummary.bind(service);
    (service as any).higherSeverity = (proto as any).higherSeverity.bind(
      service,
    );
    return service;
  }

  it('extracts risk summary correctly from matrix cells', async () => {
    const { row, state } = makeDDRow('r1', {
      riskMatrix: {
        cells: [
          {
            category: 'contractual',
            severity: 'critical',
            count: 2,
            documentRefs: [],
          },
          {
            category: 'contractual',
            severity: 'low',
            count: 1,
            documentRefs: [],
          },
          {
            category: 'financial',
            severity: 'high',
            count: 3,
            documentRefs: [],
          },
        ],
      },
      documentIndex: [],
      documentsAnalyzed: [],
      dealBreakerFlags: [],
      missingDocuments: [],
      runningFindings: {},
      perDocumentOutputs: {},
    });
    const { row: row2, state: state2 } = makeDDRow('r2', {
      documentIndex: [],
      documentsAnalyzed: [],
      dealBreakerFlags: [],
      missingDocuments: [],
      runningFindings: {},
      perDocumentOutputs: {},
    });

    const rows = new Map([
      ['r1', row],
      ['r2', row2],
    ]);
    const states = new Map([
      ['conv-r1', state],
      ['conv-r2', state2],
    ]);
    const service = buildService(rows, states);

    const result = await service.compareRooms(
      ['r1', 'r2'],
      { allowedForUserId: 'user-1', isAdmin: false },
      'org-a',
    );

    expect(result.rooms[0]!.riskSummary.byCategory.contractual.critical).toBe(
      2,
    );
    expect(result.rooms[0]!.riskSummary.byCategory.contractual.low).toBe(1);
    expect(result.rooms[0]!.riskSummary.byCategory.financial.high).toBe(3);
    expect(result.rooms[0]!.riskSummary.totalBySeverity).toEqual({
      critical: 2,
      high: 3,
      medium: 0,
      low: 1,
    });
    // Room 2: no risk matrix → all zeros
    expect(result.rooms[1]!.riskSummary.totalBySeverity).toEqual({
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    });
  });

  it('ignores unknown risk categories in matrix cells', async () => {
    const { row, state } = makeDDRow('r1', {
      riskMatrix: {
        cells: [
          {
            category: 'unknown-cat',
            severity: 'critical',
            count: 5,
            documentRefs: [],
          },
          {
            category: 'regulatory',
            severity: 'medium',
            count: 1,
            documentRefs: [],
          },
        ],
      },
      documentIndex: [],
      documentsAnalyzed: [],
      dealBreakerFlags: [],
      missingDocuments: [],
      runningFindings: {},
      perDocumentOutputs: {},
    });
    const { row: row2, state: state2 } = makeDDRow('r2', {
      documentIndex: [],
      documentsAnalyzed: [],
      dealBreakerFlags: [],
      missingDocuments: [],
      runningFindings: {},
      perDocumentOutputs: {},
    });

    const rows = new Map([
      ['r1', row],
      ['r2', row2],
    ]);
    const states = new Map([
      ['conv-r1', state],
      ['conv-r2', state2],
    ]);
    const service = buildService(rows, states);
    const result = await service.compareRooms(
      ['r1', 'r2'],
      { allowedForUserId: 'user-1', isAdmin: false },
      'org-a',
    );

    // unknown-cat is silently ignored, only regulatory counted
    expect(result.rooms[0]!.riskSummary.totalBySeverity).toEqual({
      critical: 0,
      high: 0,
      medium: 1,
      low: 0,
    });
  });

  it('aggregates financial metrics across multiple documents', async () => {
    const { row, state } = makeDDRow('r1', {
      documentIndex: [{ documentId: 'd1' }, { documentId: 'd2' }],
      documentsAnalyzed: ['d1', 'd2'],
      dealBreakerFlags: [],
      missingDocuments: [],
      runningFindings: {
        'cap-table': {
          specialistKey: 'cap-table',
          documentCount: 2,
          keyFindings: [],
          crossReferences: [],
          cumulativeRisks: [],
        },
      },
      perDocumentOutputs: {
        d1: {
          specialistOutputs: {
            'cap-table': {
              overallRisk: 'medium',
              tabular: {
                columns: ['Metric', 'Value'],
                rows: [
                  ['Shares', 1000],
                  ['Pool', 10],
                ],
              },
            },
          },
          routingDecision: {},
        },
        d2: {
          specialistOutputs: {
            'cap-table': {
              overallRisk: 'high',
              tabular: {
                columns: ['Metric', 'Value'],
                rows: [
                  ['Shares', 2000],
                  ['Warrants', 500],
                ],
              },
            },
          },
          routingDecision: {},
        },
      },
    });
    const { row: row2, state: state2 } = makeDDRow('r2', {
      documentIndex: [],
      documentsAnalyzed: [],
      dealBreakerFlags: [],
      missingDocuments: [],
      runningFindings: {},
      perDocumentOutputs: {},
    });

    const rows = new Map([
      ['r1', row],
      ['r2', row2],
    ]);
    const states = new Map([
      ['conv-r1', state],
      ['conv-r2', state2],
    ]);
    const service = buildService(rows, states);
    const result = await service.compareRooms(
      ['r1', 'r2'],
      { allowedForUserId: 'user-1', isAdmin: false },
      'org-a',
    );

    const capTable = result.rooms[0]!.financialSummary['cap-table'];
    expect(capTable).toBeDefined();
    // d2 updates Shares from 1000→2000, Pool stays from d1, Warrants added from d2
    expect(capTable!.overallRisk).toBe('high'); // highest across docs
    const metrics = capTable!.keyMetrics;
    expect(metrics.find((m) => m.label === 'Shares')?.value).toBe(2000);
    expect(metrics.find((m) => m.label === 'Pool')?.value).toBe(10);
    expect(metrics.find((m) => m.label === 'Warrants')?.value).toBe(500);
  });

  it('returns empty financial summary when no running findings exist', async () => {
    const { row, state } = makeDDRow('r1', {
      documentIndex: [],
      documentsAnalyzed: [],
      dealBreakerFlags: [],
      missingDocuments: [],
      runningFindings: {},
      perDocumentOutputs: {},
    });
    const { row: row2, state: state2 } = makeDDRow('r2', {
      documentIndex: [],
      documentsAnalyzed: [],
      dealBreakerFlags: [],
      missingDocuments: [],
      runningFindings: {},
      perDocumentOutputs: {},
    });

    const rows = new Map([
      ['r1', row],
      ['r2', row2],
    ]);
    const states = new Map([
      ['conv-r1', state],
      ['conv-r2', state2],
    ]);
    const service = buildService(rows, states);
    const result = await service.compareRooms(
      ['r1', 'r2'],
      { allowedForUserId: 'user-1', isAdmin: false },
      'org-a',
    );

    expect(Object.keys(result.rooms[0]!.financialSummary)).toHaveLength(0);
  });

  it('throws NotFoundException for non-DD job type', async () => {
    const { row } = makeDDRow('r1', {});
    row.input = {
      data: { content: '' },
      metadata: { jobType: 'document-analysis' },
    };
    const { row: row2, state: state2 } = makeDDRow('r2', {
      documentIndex: [],
      documentsAnalyzed: [],
      dealBreakerFlags: [],
      missingDocuments: [],
      runningFindings: {},
      perDocumentOutputs: {},
    });

    const rows = new Map([
      ['r1', row],
      ['r2', row2],
    ]);
    const states = new Map([['conv-r2', state2]]);
    const service = buildService(rows, states);
    await expect(
      service.compareRooms(
        ['r1', 'r2'],
        { allowedForUserId: 'user-1', isAdmin: false },
        'org-a',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException for missing job', async () => {
    const { row: row2, state: state2 } = makeDDRow('r2', {
      documentIndex: [],
      documentsAnalyzed: [],
      dealBreakerFlags: [],
      missingDocuments: [],
      runningFindings: {},
      perDocumentOutputs: {},
    });

    const rows = new Map([['r2', row2]]);
    const states = new Map([['conv-r2', state2]]);
    const service = buildService(rows, states);
    await expect(
      service.compareRooms(
        ['missing', 'r2'],
        { allowedForUserId: 'user-1', isAdmin: false },
        'org-a',
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
