import { LegalJobsWorkerService } from './legal-jobs-worker.service';
import { LegalJobsRepository } from './legal-jobs.repository';
import { LegalCapabilityConfigRepository } from './legal-capability-config.repository';
import { LegalIntelligenceService } from '../services/legal-intelligence.service';
import { ProviderConcurrencyRegistry } from './provider-concurrency';
import { LegalDepartmentService } from '../legal-department.service';
import { AgentJobRow } from './legal-jobs.types';

function makeCapabilityConfig(): LegalCapabilityConfigRepository {
  return {
    listForCapability: jest.fn().mockResolvedValue([]),
    findRow: jest.fn().mockResolvedValue(null),
    upsert: jest.fn(),
  } as unknown as LegalCapabilityConfigRepository;
}

function makeLegalIntelligence(): LegalIntelligenceService {
  return {
    extractMetadata: jest.fn().mockResolvedValue({
      documentType: 'nda',
      confidence: 0.9,
      sections: [],
      signatures: [],
      dates: [],
      parties: [],
      extractedAt: new Date().toISOString(),
    }),
  } as unknown as LegalIntelligenceService;
}

const baseRow: AgentJobRow = {
  id: 'job-1',
  org_slug: 'org-a',
  user_id: 'user-1',
  conversation_id: 'conv-1',
  agent_slug: 'legal-department',
  job_type: 'document-analysis',
  provider: 'ollama',
  model: 'gemma4:e4b',
  status: 'processing',
  current_step: null,
  progress: 0,
  last_message: null,
  error: null,
  input: { data: { content: 'hello world' } },
  result: null,
  queued_at: '2026-04-07T00:00:00Z',
  started_at: '2026-04-07T00:00:01Z',
  completed_at: null,
  original_file_path: null,
  document_paths: [],
  document_count: 1,
  review_decision: null,
};

function makeRepo(overrides: Partial<jest.Mocked<LegalJobsRepository>> = {}) {
  return {
    insertQueued: jest.fn(),
    findByIdForOrg: jest.fn(),
    listForOrg: jest.fn(),
    claimNextQueued: jest.fn(),
    updateProgress: jest.fn().mockResolvedValue(undefined),
    markCompleted: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
    markAwaitingReview: jest.fn().mockResolvedValue(undefined),
    clearReviewDecision: jest.fn().mockResolvedValue(undefined),
    recordReviewAndRequeue: jest.fn().mockResolvedValue(null),
    listEventsForConversation: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<LegalJobsRepository>;
}

function makeConcurrency() {
  return new ProviderConcurrencyRegistry();
}

function makeLegalService(
  overrides: Partial<LegalDepartmentService> = {},
): LegalDepartmentService {
  return {
    process: jest.fn().mockResolvedValue({
      taskId: 'conv-1',
      status: 'completed',
      userMessage: 'hello world',
      response: 'analysis done',
      duration: 1234,
      specialistOutputs: [],
      legalMetadata: {},
      routingDecision: {},
    }),
    resumeWithDecision: jest.fn().mockResolvedValue({
      taskId: 'conv-1',
      status: 'completed',
      userMessage: 'hello world',
      response: 'resumed and done',
      duration: 100,
    }),
    ...overrides,
  } as unknown as LegalDepartmentService;
}

describe('LegalJobsWorkerService.executeJob', () => {
  it('marks completed and writes the result on success', async () => {
    const repo = makeRepo();
    const legal = makeLegalService();
    const worker = new LegalJobsWorkerService(
      repo,
      makeConcurrency(),
      legal,
      makeCapabilityConfig(),
      makeLegalIntelligence(),
    );

    await worker.executeJob({ ...baseRow });

    expect(legal.process).toHaveBeenCalledTimes(1);
    const callArg = (legal.process as jest.Mock).mock.calls[0][0];
    expect(callArg.context.conversationId).toBe('conv-1');
    expect(callArg.context.orgSlug).toBe('org-a');
    expect(callArg.documents[0].content).toBe('hello world');
    expect(repo.markCompleted).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ response: 'analysis done' }),
    );
    expect(repo.markFailed).not.toHaveBeenCalled();
  });

  it('marks failed when the legal service throws', async () => {
    const repo = makeRepo();
    const legal = makeLegalService({
      process: jest.fn().mockRejectedValue(new Error('boom')) as never,
    });
    const worker = new LegalJobsWorkerService(
      repo,
      makeConcurrency(),
      legal,
      makeCapabilityConfig(),
      makeLegalIntelligence(),
    );

    await worker.executeJob({ ...baseRow });

    expect(repo.markFailed).toHaveBeenCalledWith('job-1', 'boom');
    expect(repo.markCompleted).not.toHaveBeenCalled();
  });

  it('marks failed when the legal service returns non-completed status', async () => {
    const repo = makeRepo();
    const legal = makeLegalService({
      process: jest.fn().mockResolvedValue({
        taskId: 'conv-1',
        status: 'failed',
        userMessage: '',
        error: 'workflow blew up',
        duration: 100,
      }) as never,
    });
    const worker = new LegalJobsWorkerService(
      repo,
      makeConcurrency(),
      legal,
      makeCapabilityConfig(),
      makeLegalIntelligence(),
    );

    await worker.executeJob({ ...baseRow });

    expect(repo.markFailed).toHaveBeenCalledWith('job-1', 'workflow blew up');
  });

  it('passes ExecutionContext as a whole capsule, not destructured fields', async () => {
    const repo = makeRepo();
    const legal = makeLegalService();
    const worker = new LegalJobsWorkerService(
      repo,
      makeConcurrency(),
      legal,
      makeCapabilityConfig(),
      makeLegalIntelligence(),
    );
    await worker.executeJob({ ...baseRow });

    const ctx = (legal.process as jest.Mock).mock.calls[0][0].context;
    expect(ctx).toMatchObject({
      orgSlug: 'org-a',
      userId: 'user-1',
      conversationId: 'conv-1',
      provider: 'ollama',
      model: 'gemma4:e4b',
    });
  });
});

describe('LegalJobsWorkerService.tick', () => {
  it('does nothing when no queued rows', async () => {
    const repo = makeRepo({
      claimNextQueued: jest.fn().mockResolvedValue(null) as never,
    });
    const legal = makeLegalService();
    const worker = new LegalJobsWorkerService(
      repo,
      makeConcurrency(),
      legal,
      makeCapabilityConfig(),
      makeLegalIntelligence(),
    );
    await worker.tick();
    expect(legal.process).not.toHaveBeenCalled();
  });

  it('transitions to awaiting_review when the graph throws GraphInterrupt', async () => {
    // Simulate the langgraph module's GraphInterrupt — the worker uses
    // isGraphInterrupt() so any instance-marked object with the right
    // brand works. Easiest: import and construct via the real symbol.
    const { GraphInterrupt } = await import('@langchain/langgraph');
    const repo = makeRepo({
      claimNextQueued: jest.fn().mockResolvedValue(baseRow) as never,
    });
    const legal = makeLegalService({
      process: jest.fn().mockRejectedValue(new GraphInterrupt([])) as never,
    });
    const worker = new LegalJobsWorkerService(
      repo,
      makeConcurrency(),
      legal,
      makeCapabilityConfig(),
      makeLegalIntelligence(),
    );
    await worker.tick();
    expect(repo.markAwaitingReview).toHaveBeenCalledWith('job-1');
    expect(repo.markFailed).not.toHaveBeenCalled();
    expect(repo.markCompleted).not.toHaveBeenCalled();
  });

  it('dispatches resumeWithDecision when the claimed row has a review_decision', async () => {
    const resumingRow: AgentJobRow = {
      ...baseRow,
      review_decision: { decision: 'approve' },
    };
    const repo = makeRepo({
      claimNextQueued: jest.fn().mockResolvedValue(resumingRow) as never,
    });
    const legal = makeLegalService();
    const worker = new LegalJobsWorkerService(
      repo,
      makeConcurrency(),
      legal,
      makeCapabilityConfig(),
      makeLegalIntelligence(),
    );
    await worker.tick();
    expect(legal.resumeWithDecision).toHaveBeenCalledTimes(1);
    expect(legal.process).not.toHaveBeenCalled();
    expect(repo.markCompleted).toHaveBeenCalled();
    expect(repo.clearReviewDecision).toHaveBeenCalledWith('job-1');
  });

  it('runs the claimed job', async () => {
    const repo = makeRepo({
      claimNextQueued: jest.fn().mockResolvedValue(baseRow) as never,
    });
    const legal = makeLegalService();
    const worker = new LegalJobsWorkerService(
      repo,
      makeConcurrency(),
      legal,
      makeCapabilityConfig(),
      makeLegalIntelligence(),
    );
    await worker.tick();
    expect(legal.process).toHaveBeenCalledTimes(1);
    expect(repo.markCompleted).toHaveBeenCalled();
  });
});
