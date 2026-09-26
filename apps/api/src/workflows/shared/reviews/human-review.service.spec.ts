import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { ConfigProvider } from '@orchestratorai/planes/config';
import type { WorkTaskSink } from '@orchestratorai/planes/work-routing';
import type { ObservabilityService } from '../services/observability.service';
import { HumanReviewError, HumanReviewService } from './human-review.service';
import type { HumanReviewsRepository } from './human-reviews.repository';
import type { HumanGate, HumanReviewRecord, HumanReviewResponse } from './human-review.types';

const runId = '11111111-1111-4111-a111-111111111111';
const gate: HumanGate = {
  slug: 'approve-digest',
  kind: 'approval',
  allowedDecisions: ['approve', 'reject'],
  allowItemDecisions: false,
  onReject: 'rerun_stage',
  taskTitle: 'Approve the weekly digest',
};

function review(overrides: Partial<HumanReviewRecord> = {}): HumanReviewRecord {
  return {
    id: 'r1',
    runId,
    organizationSlug: 'finance',
    workflowSlug: 'exec-digest',
    gateSlug: gate.slug,
    round: 0,
    kind: 'approval',
    allowedDecisions: ['approve', 'reject'],
    allowItemDecisions: false,
    payload: {},
    status: 'waiting',
    response: null,
    respondedBy: null,
    respondedAt: null,
    workTask: { provider: 'flow', taskId: 't1' },
    createdAt: 't',
    ...overrides,
  };
}

function setup() {
  const repo = {
    createIfAbsent: jest.fn(async (): Promise<HumanReviewRecord | null> => review()),
    attachWorkTask: jest.fn(async () => undefined),
    getForOrg: jest.fn(async (): Promise<HumanReviewRecord | null> => review()),
    respond: jest.fn(async (): Promise<string | null> => null),
    expireWaiting: jest.fn(async (): Promise<HumanReviewRecord | null> => review()),
  };
  const tasks = {
    createTask: jest.fn(async () => ({ id: 't1', title: 'x', provider: 'flow' as const })),
    updateTaskStatus: jest.fn(async () => undefined),
  };
  const observability = {
    emitHitlWaiting: jest.fn(async () => undefined),
    emitHitlResumed: jest.fn(async () => undefined),
  };
  const config = { getRequired: () => 'https://app.example/' } as unknown as ConfigProvider;
  const service = new HumanReviewService(
    repo as unknown as HumanReviewsRepository,
    tasks as unknown as WorkTaskSink,
    observability as unknown as ObservabilityService,
    config,
  );
  const context = createMockExecutionContext({
    orgSlug: 'finance',
    conversationId: runId,
    agentSlug: 'exec-digest',
    agentType: 'workflow',
  });
  return { service, repo, tasks, observability, context };
}

describe('HumanReviewService.requestReview', () => {
  it('opens the review, creates a task linking to the run, and emits waiting', async () => {
    const { service, repo, tasks, observability, context } = setup();
    await service.requestReview(context, gate, 0, { draft: 'x' });

    expect(repo.createIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ runId, gateSlug: gate.slug, round: 0, kind: 'approval' }),
    );
    expect(tasks.createTask).toHaveBeenCalledWith({
      title: gate.taskTitle,
      description: expect.stringContaining(
        `https://app.example/app/workflows/exec-digest?conversationId=${runId}`,
      ),
    });
    expect(repo.attachWorkTask).toHaveBeenCalledWith('r1', 'flow', 't1');
    expect(observability.emitHitlWaiting).toHaveBeenCalledTimes(1);
  });

  it('does nothing more when the node re-runs on resume', async () => {
    const { service, repo, tasks, observability, context } = setup();
    repo.createIfAbsent.mockResolvedValueOnce(null);
    await service.requestReview(context, gate, 0, { draft: 'x' });
    expect(tasks.createTask).not.toHaveBeenCalled();
    expect(observability.emitHitlWaiting).not.toHaveBeenCalled();
  });
});

describe('HumanReviewService.respond', () => {
  const approve = { kind: 'decision' as const, decision: { type: 'approve' as const } };

  it('records the response, closes the task and emits resumed', async () => {
    const { service, repo, tasks, observability, context } = setup();
    await service.respond(context, 'r1', approve);
    expect(repo.respond).toHaveBeenCalledWith(review(), approve, context.userId);
    expect(tasks.updateTaskStatus).toHaveBeenCalledWith({ taskId: 't1', status: 'done' });
    expect(observability.emitHitlResumed).toHaveBeenCalledWith(context, runId, 'approve');
  });

  const cases: Array<[string, HumanReviewRecord, HumanReviewResponse, string]> = [
    ['a review of another run', review({ runId: 'other' }), approve, 'not_found'],
    ['an answer to an approval gate', review(), { kind: 'answer', answer: { text: 'x', turn: 0 } }, 'invalid'],
    ['a decision the gate does not allow', review(), { kind: 'decision', decision: { type: 'modify', items: [] } }, 'invalid'],
    ['a decision to an answer gate', review({ kind: 'answer', allowedDecisions: [] }), approve, 'invalid'],
  ];
  it.each(cases)('refuses %s', async (_label, stored, response, code) => {
    const { service, repo, context } = setup();
    repo.getForOrg.mockResolvedValueOnce(stored);
    await expect(service.respond(context, 'r1', response)).rejects.toMatchObject({ code });
    expect(repo.respond).not.toHaveBeenCalled();
  });

  it.each([
    ['already_answered', 'conflict'],
    ['run_not_waiting', 'conflict'],
    ['not_found', 'not_found'],
  ] as const)('maps a %s refusal to %s', async (refusal, code) => {
    const { service, repo, tasks, context } = setup();
    repo.respond.mockResolvedValueOnce(refusal);
    const error = await service.respond(context, 'r1', approve).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HumanReviewError);
    expect(error).toMatchObject({ code });
    expect(tasks.updateTaskStatus).not.toHaveBeenCalled();
  });
});

describe('HumanReviewService.closeForEndedRun', () => {
  it('expires the open review and closes its task', async () => {
    const { service, repo, tasks } = setup();
    await service.closeForEndedRun(runId);
    expect(repo.expireWaiting).toHaveBeenCalledWith(runId);
    expect(tasks.updateTaskStatus).toHaveBeenCalledWith({ taskId: 't1', status: 'done' });
  });
});
