import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { DatabaseJobQueueService } from '@orchestratorai/planes/database';
import type { ConfigProvider } from '@orchestratorai/planes/config';
import type { ObservabilityService } from '../services/observability.service';
import {
  WorkflowHandlerRegistry,
  WorkflowTransientError,
  type WorkflowHandlerOutcome,
  type WorkflowRunExecution,
  type WorkflowRunHandler,
} from './workflow-handler.registry';
import {
  WorkflowRunTransitionError,
  type WorkflowRunsRepository,
} from './workflow-runs.repository';
import type { WorkflowRunRecord } from './workflow-run.types';
import {
  WorkflowWorkerService,
  readWorkflowWorkerSettings,
} from './workflow-worker.service';

const settings: Record<string, string> = {
  WORKFLOW_WORKER_ENABLED: 'true',
  WORKFLOW_WORKER_POLL_MS: '1000',
  WORKFLOW_WORKER_MAX_CONCURRENT: '2',
  WORKFLOW_WORKER_LEASE_SECONDS: '60',
  WORKFLOW_PROVIDER_CONCURRENCY: '{"ollama":2}',
};

function config(overrides: Record<string, string> = {}): ConfigProvider {
  const values = { ...settings, ...overrides };
  return {
    getRequired: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Missing required configuration key: ${key}`);
      return value;
    },
    getNumber: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`Missing required number configuration key: ${key}`);
      return Number(value);
    },
  } as unknown as ConfigProvider;
}

function queuedRow(id: string, overrides: Record<string, unknown> = {}) {
  const context = createMockExecutionContext({
    conversationId: id,
    agentSlug: 'exec-digest',
    agentType: 'workflow',
    provider: 'ollama',
  });
  return {
    id,
    organization_slug: context.orgSlug,
    user_id: context.userId,
    workflow_slug: context.agentSlug,
    execution_context: context,
    status: 'running',
    current_step: null,
    progress: null,
    last_message: null,
    error: null,
    input: {},
    documents: [],
    model_profile: {},
    result: null,
    pending_action: null,
    access_control: { mode: 'org' },
    attempt: 1,
    max_attempts: 2,
    lease_expires_at: new Date(),
    worker_id: 'w',
    queued_at: new Date(),
    started_at: new Date(),
    completed_at: null,
    ...overrides,
  };
}

function setup(rows: Record<string, unknown>[], overrides: Record<string, string> = {}) {
  const pending = [...rows];
  const queue = {
    claimNext: jest.fn(async () => pending.shift() ?? null),
    heartbeat: jest.fn(async () => true),
    reclaimExpired: jest.fn(async () => ({ requeued: [], failed: [], canceled: [] })),
  };
  const done = (run: WorkflowRunRecord) => run;
  const runs = {
    getForOrg: jest.fn(async () => null),
    updateProgress: jest.fn(async () => undefined),
    markCompleted: jest.fn(async (run: WorkflowRunRecord) => done(run)),
    markFailed: jest.fn(async (run: WorkflowRunRecord) => done(run)),
    requeueForRetry: jest.fn(async (run: WorkflowRunRecord) => done(run)),
    markCanceled: jest.fn(async (run: WorkflowRunRecord) => done(run)),
    markAwaitingReview: jest.fn(async (run: WorkflowRunRecord) => done(run)),
  };
  const observability = { emitFailed: jest.fn(async () => undefined) };
  const handlers = new WorkflowHandlerRegistry();
  const worker = new WorkflowWorkerService(
    queue as unknown as DatabaseJobQueueService,
    runs as unknown as WorkflowRunsRepository,
    handlers,
    observability as unknown as ObservabilityService,
    config(overrides),
  );
  return { worker, queue, runs, observability, handlers };
}

function handler(run: WorkflowRunHandler['run']): WorkflowRunHandler {
  return { slug: 'exec-digest', run };
}

describe('readWorkflowWorkerSettings', () => {
  it('reads every setting', () => {
    expect(readWorkflowWorkerSettings(config())).toEqual({
      enabled: true,
      pollMs: 1000,
      maxConcurrent: 2,
      leaseSeconds: 60,
      providerLimits: { ollama: 2 },
    });
  });

  it('refuses to start when a setting is missing', () => {
    const values = { ...settings };
    delete (values as Partial<typeof values>).WORKFLOW_WORKER_LEASE_SECONDS;
    const partial = {
      getRequired: (key: string) => values[key] ?? (() => { throw new Error(`Missing ${key}`); })(),
      getNumber: (key: string) => {
        if (values[key] === undefined) throw new Error(`Missing required number configuration key: ${key}`);
        return Number(values[key]);
      },
    } as unknown as ConfigProvider;
    expect(() => readWorkflowWorkerSettings(partial)).toThrow('WORKFLOW_WORKER_LEASE_SECONDS');
  });

  it('rejects an ambiguous enabled flag', () => {
    expect(() => readWorkflowWorkerSettings(config({ WORKFLOW_WORKER_ENABLED: 'yes' }))).toThrow(
      'WORKFLOW_WORKER_ENABLED',
    );
  });
});

describe('WorkflowWorkerService', () => {
  it('runs a claimed run through its handler and completes it', async () => {
    const { worker, runs, handlers, queue } = setup([queuedRow('run-1')]);
    const run = jest.fn<Promise<WorkflowHandlerOutcome>, [WorkflowRunExecution]>(
      async () => ({ kind: 'completed', result: { ok: true } }),
    );
    handlers.register(handler(run));

    await worker.tick();
    await worker.drain();

    expect(queue.reclaimExpired).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
    const execution = run.mock.calls[0]?.[0];
    expect(execution).toBeDefined();
    expect(Object.isFrozen(execution?.run.executionContext)).toBe(true);
    expect(runs.markCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'run-1' }),
      worker.workerId,
      { ok: true },
    );
  });

  it('parks a run that stopped at a human gate', async () => {
    const { worker, runs, handlers } = setup([queuedRow('run-1')]);
    handlers.register(handler(async () => ({ kind: 'awaiting_review' })));

    await worker.tick();
    await worker.drain();

    expect(runs.markAwaitingReview).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'run-1' }),
      worker.workerId,
    );
    expect(runs.markCompleted).not.toHaveBeenCalled();
  });

  it('claims no more than maxConcurrent runs per tick', async () => {
    const { worker, handlers, queue } = setup([
      queuedRow('run-1'),
      queuedRow('run-2'),
      queuedRow('run-3'),
    ]);
    let releaseAll!: () => void;
    const gate = new Promise<void>((resolve) => (releaseAll = resolve));
    handlers.register(handler(async () => {
      await gate;
      return { kind: 'completed', result: null };
    }));

    await worker.tick();
    expect(queue.claimNext).toHaveBeenCalledTimes(2);

    releaseAll();
    await worker.drain();
  });

  it('requeues a transient failure while attempts remain', async () => {
    const { worker, runs, handlers, observability } = setup([queuedRow('run-1', { attempt: 1, max_attempts: 2 })]);
    handlers.register(handler(async () => {
      throw new WorkflowTransientError('provider timeout');
    }));

    await worker.tick();
    await worker.drain();

    expect(runs.requeueForRetry).toHaveBeenCalledWith(expect.anything(), worker.workerId, 'provider timeout');
    expect(runs.markFailed).not.toHaveBeenCalled();
    expect(observability.emitFailed).not.toHaveBeenCalled();
  });

  it('fails a transient failure on its last attempt and emits failed', async () => {
    const { worker, runs, handlers, observability } = setup([queuedRow('run-1', { attempt: 2, max_attempts: 2 })]);
    handlers.register(handler(async () => {
      throw new WorkflowTransientError('provider timeout');
    }));

    await worker.tick();
    await worker.drain();

    expect(runs.markFailed).toHaveBeenCalledWith(expect.anything(), worker.workerId, 'provider timeout');
    expect(observability.emitFailed).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'run-1' }),
      'run-1',
      'provider timeout',
      expect.any(Number),
    );
  });

  it('fails a non-transient error on the first attempt', async () => {
    const { worker, runs, handlers } = setup([queuedRow('run-1', { attempt: 1, max_attempts: 3 })]);
    handlers.register(handler(async () => {
      throw new Error('bad input');
    }));

    await worker.tick();
    await worker.drain();

    expect(runs.requeueForRetry).not.toHaveBeenCalled();
    expect(runs.markFailed).toHaveBeenCalledWith(expect.anything(), worker.workerId, 'bad input');
  });

  it('fails a run whose workflow has no handler', async () => {
    const { worker, runs } = setup([queuedRow('run-1')]);

    await worker.tick();
    await worker.drain();

    expect(runs.markFailed).toHaveBeenCalledWith(
      expect.anything(),
      worker.workerId,
      'No run handler is registered for workflow "exec-digest"',
    );
  });

  it('fails a run whose provider has no concurrency limit', async () => {
    const context = createMockExecutionContext({
      conversationId: 'run-1',
      agentSlug: 'exec-digest',
      agentType: 'workflow',
      provider: 'openai',
    });
    const { worker, runs, handlers } = setup([queuedRow('run-1', { execution_context: context })]);
    handlers.register(handler(async () => ({ kind: 'completed', result: null })));

    await worker.tick();
    await worker.drain();

    expect(runs.markFailed).toHaveBeenCalledWith(
      expect.anything(),
      worker.workerId,
      'No concurrency limit is configured for provider "openai"',
    );
  });

  it('cancels instead of completing when a cancel lands after the handler finished', async () => {
    const { worker, runs, handlers } = setup([queuedRow('run-1')]);
    runs.markCompleted.mockRejectedValueOnce(new WorkflowRunTransitionError('run-1', 'complete'));
    handlers.register(handler(async () => ({ kind: 'completed', result: null })));

    await worker.tick();
    await worker.drain();

    expect(runs.markCanceled).toHaveBeenCalledTimes(1);
  });

  it('logs and leaves an unreadable claimed row to lease reclaim', async () => {
    const { worker, runs } = setup([queuedRow('run-1', { status: 'processing' })]);

    await worker.tick();
    await worker.drain();

    expect(runs.markFailed).not.toHaveBeenCalled();
    expect(runs.markCompleted).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    const { worker } = setup([], { WORKFLOW_WORKER_ENABLED: 'false' });
    const spy = jest.spyOn(global, 'setInterval');
    worker.onModuleInit();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
