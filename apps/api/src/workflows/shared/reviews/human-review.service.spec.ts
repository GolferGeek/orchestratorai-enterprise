import { createMockExecutionContext, NIL_UUID } from '@orchestrator-ai/transport-types';
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
    ticks: {},
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
    getWaitingForRun: jest.fn(async (): Promise<HumanReviewRecord | null> => review()),
    tick: jest.fn(async (): Promise<string> => 'ticked'),
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

const pickup: Extract<HumanGate, { kind: 'event' }> = {
  slug: 'pickup',
  kind: 'event',
  event: 'carrier.pickup',
  waitingFor: 'carrier pickup',
};

function pickupReview(overrides: Partial<HumanReviewRecord> = {}): HumanReviewRecord {
  return review({
    gateSlug: pickup.slug,
    kind: 'event',
    allowedDecisions: [],
    payload: { event: 'carrier.pickup', waitingFor: 'carrier pickup', detail: { tracking: '1Z' } },
    workTask: null,
    ...overrides,
  });
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
    // The worker announces it once the pause is stored (announceWaiting).
    expect(observability.emitHitlWaiting).not.toHaveBeenCalled();
  });

  it('does nothing more when the node re-runs on resume', async () => {
    const { service, repo, tasks, observability, context } = setup();
    repo.createIfAbsent.mockResolvedValueOnce(null);
    await service.requestReview(context, gate, 0, { draft: 'x' });
    expect(tasks.createTask).not.toHaveBeenCalled();
    expect(observability.emitHitlWaiting).not.toHaveBeenCalled();
  });
});

describe('an event gate', () => {
  const pickedUp = { name: 'carrier.pickup', payload: { tracking: '1Z', at: '2026-10-06T15:00:00Z' } };

  it('opens with no work task, storing the event it waits for', async () => {
    const { service, repo, tasks, observability, context } = setup();
    await service.requestReview(context, pickup, 0, { tracking: '1Z' });
    expect(repo.createIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'event', payload: { event: 'carrier.pickup', waitingFor: 'carrier pickup', detail: { tracking: '1Z' } } }),
    );
    expect(tasks.createTask).not.toHaveBeenCalled();
    expect(observability.emitHitlWaiting).not.toHaveBeenCalled();
  });

  it('is announced as waiting for its event', async () => {
    const { service, repo, observability, context } = setup();
    repo.getWaitingForRun.mockResolvedValueOnce(pickupReview());
    await service.announceWaiting(context);
    expect(observability.emitHitlWaiting).toHaveBeenCalledWith(
      context, runId, { reviewId: 'r1', gate: 'pickup', kind: 'event' }, 'Waiting for carrier pickup',
    );
  });

  it('is resolved by its event, as the system user, and the run resumes', async () => {
    const { service, repo, observability, context } = setup();
    repo.getWaitingForRun.mockResolvedValueOnce(pickupReview());
    expect(await service.deliverEvent(context, pickedUp)).toEqual({ resumed: true });
    expect(repo.respond).toHaveBeenCalledWith(pickupReview(), { kind: 'event', event: pickedUp }, NIL_UUID);
    expect(observability.emitHitlResumed).toHaveBeenCalledWith(context, runId, 'event');
  });

  it.each<[string, () => HumanReviewRecord | null, { name: string; payload: Record<string, never> }, string]>([
    ['another event', () => pickupReview(), { name: 'carrier.delivered', payload: {} }, 'the run waits for carrier.pickup, not carrier.delivered'],
    ['a run waiting on a person', () => review(), { name: 'carrier.pickup', payload: {} }, 'the run waits for a person at "approve-digest"'],
    ['a run waiting on nothing', () => null, { name: 'carrier.pickup', payload: {} }, 'the run is not waiting'],
  ])('leaves the run alone for %s, saying why', async (_label, waiting, event, reason) => {
    const { service, repo, context } = setup();
    repo.getWaitingForRun.mockResolvedValueOnce(waiting());
    expect(await service.deliverEvent(context, event)).toEqual({ resumed: false, reason });
    expect(repo.respond).not.toHaveBeenCalled();
  });

  it('resumes the run once when the same event arrives twice', async () => {
    const { service, repo, observability, context } = setup();
    repo.getWaitingForRun.mockResolvedValueOnce(pickupReview());
    repo.respond.mockResolvedValueOnce('already_answered');
    expect(await service.deliverEvent(context, pickedUp)).toEqual({ resumed: false, reason: 'carrier.pickup already resolved the gate' });
    expect(observability.emitHitlResumed).not.toHaveBeenCalled();
  });
});

describe('a checklist gate', () => {
  const packing: HumanGate = { slug: 'packing', kind: 'checklist', taskTitle: 'Pack order 1042' };
  const lines = { items: [{ itemId: 'line-1', label: 'Pack 2 x anti-GFAP' }, { itemId: 'ice', label: 'Ice packed properly' }] };
  const checklist = (overrides: Partial<HumanReviewRecord> = {}) =>
    review({ gateSlug: 'packing', kind: 'checklist', allowedDecisions: [], payload: lines, ...overrides });

  it('opens with a task when its lines are well formed', async () => {
    const { service, repo, tasks, context } = setup();
    await service.requestReview(context, packing, 0, lines);
    expect(repo.createIfAbsent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'checklist', payload: lines }));
    expect(tasks.createTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Pack order 1042' }));
  });

  it.each([
    ['no lines', { items: [] }, 'A checklist needs payload.items, one or more'],
    ['a line without a label', { items: [{ itemId: 'ice' }] }, 'Every checklist line needs an itemId and a label'],
    ['the same line twice', { items: [{ itemId: 'ice', label: 'a' }, { itemId: 'ice', label: 'b' }] }, 'Checklist line "ice" appears twice'],
  ])('refuses to open with %s', async (_label, payload, message) => {
    const { service, repo, context } = setup();
    await expect(service.requestReview(context, packing, 0, payload)).rejects.toThrow(message);
    expect(repo.createIfAbsent).not.toHaveBeenCalled();
  });

  it('records a tick as the person, without resuming the run', async () => {
    const { service, repo, tasks, observability, context } = setup();
    repo.getForOrg.mockResolvedValueOnce(checklist());
    expect(await service.tick(context, 'r1', 'ice', true)).toEqual({ resumed: false });
    expect(repo.tick).toHaveBeenCalledWith(checklist(), 'ice', true, context.userId);
    expect(tasks.updateTaskStatus).not.toHaveBeenCalled();
    expect(observability.emitHitlResumed).not.toHaveBeenCalled();
  });

  it('closes the task and says the run resumed on the last tick', async () => {
    const { service, repo, tasks, observability, context } = setup();
    repo.getForOrg.mockResolvedValueOnce(checklist());
    repo.tick.mockResolvedValueOnce('completed');
    expect(await service.tick(context, 'r1', 'ice', true)).toEqual({ resumed: true });
    expect(tasks.updateTaskStatus).toHaveBeenCalledWith({ taskId: 't1', status: 'done' });
    expect(observability.emitHitlResumed).toHaveBeenCalledWith(context, runId, 'checklist', 'Checklist finished: packing');
  });

  it.each<[string, () => HumanReviewRecord, string, string]>([
    ['a line the checklist does not have', () => checklist(), 'label-printer', 'invalid'],
    ['a review that is not a checklist', () => review(), 'ice', 'invalid'],
    ['a checklist of another run', () => checklist({ runId: 'other' }), 'ice', 'not_found'],
  ])('refuses a tick on %s', async (_label, stored, itemId, code) => {
    const { service, repo, context } = setup();
    repo.getForOrg.mockResolvedValueOnce(stored());
    await expect(service.tick(context, 'r1', itemId, true)).rejects.toMatchObject({ code });
    expect(repo.tick).not.toHaveBeenCalled();
  });

  it.each([['already_answered'], ['run_not_waiting']])('answers a %s tick with a conflict', async (refusal) => {
    const { service, repo, context } = setup();
    repo.getForOrg.mockResolvedValueOnce(checklist());
    repo.tick.mockResolvedValueOnce(refusal);
    await expect(service.tick(context, 'r1', 'ice', true)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('cannot be finished by a decision', async () => {
    const { service, repo, context } = setup();
    repo.getForOrg.mockResolvedValueOnce(checklist());
    await expect(
      service.respond(context, 'r1', { kind: 'decision', decision: { type: 'approve' } }),
    ).rejects.toMatchObject({ code: 'invalid', message: 'A checklist finishes when every line is ticked' });
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
    ['a person answering an event gate', pickupReview(), { kind: 'answer', answer: { text: 'it was picked up', turn: 0 } }, 'invalid'],
    ['a person sending an event', review(), { kind: 'event', event: { name: 'carrier.pickup', payload: {} } }, 'invalid'],
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

describe('HumanReviewService.announceWaiting', () => {
  it('announces the review the run waits on', async () => {
    const { service, observability, context } = setup();
    await service.announceWaiting(context);
    expect(observability.emitHitlWaiting).toHaveBeenCalledWith(
      context, runId, { reviewId: 'r1', gate: 'approve-digest', kind: 'approval' }, 'Waiting for a review at "approve-digest"',
    );
  });

  it('fails loudly when a waiting run has no waiting review', async () => {
    const { service, repo, context } = setup();
    repo.getWaitingForRun.mockResolvedValueOnce(null);
    await expect(service.announceWaiting(context)).rejects.toThrow('has no waiting review');
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
