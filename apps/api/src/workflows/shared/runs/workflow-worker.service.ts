import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  DATABASE_JOB_QUEUE_SERVICE,
  type DatabaseJobQueueService,
} from '@orchestratorai/planes/database';
import {
  CONFIG_PROVIDER_SERVICE,
  type ConfigProvider,
} from '@orchestratorai/planes/config';
import { ObservabilityService } from '../services/observability.service';
import {
  WorkflowHandlerRegistry,
  WorkflowTransientError,
} from './workflow-handler.registry';
import {
  ProviderConcurrencyRegistry,
  parseProviderLimits,
} from './provider-concurrency.registry';
import {
  WorkflowRunsRepository,
  WorkflowRunTransitionError,
} from './workflow-runs.repository';
import {
  toWorkflowRunRecord,
  WORKFLOW_RUNS_QUEUE,
  type WorkflowRunRecord,
} from './workflow-run.types';

export interface WorkflowWorkerSettings {
  enabled: boolean;
  pollMs: number;
  maxConcurrent: number;
  leaseSeconds: number;
  providerLimits: Record<string, number>;
}

function requiredPositiveInt(config: ConfigProvider, key: string): number {
  const value = config.getNumber(key);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${key} must be a positive integer`);
  }
  return value;
}

/** Every worker setting is required; nothing is defaulted in code. */
export function readWorkflowWorkerSettings(config: ConfigProvider): WorkflowWorkerSettings {
  const enabled = config.getRequired('WORKFLOW_WORKER_ENABLED');
  if (enabled !== 'true' && enabled !== 'false') {
    throw new Error('WORKFLOW_WORKER_ENABLED must be "true" or "false"');
  }
  return {
    enabled: enabled === 'true',
    pollMs: requiredPositiveInt(config, 'WORKFLOW_WORKER_POLL_MS'),
    maxConcurrent: requiredPositiveInt(config, 'WORKFLOW_WORKER_MAX_CONCURRENT'),
    leaseSeconds: requiredPositiveInt(config, 'WORKFLOW_WORKER_LEASE_SECONDS'),
    providerLimits: parseProviderLimits(config.getRequired('WORKFLOW_PROVIDER_CONCURRENCY')),
  };
}

type StopReason = 'cancel_requested' | 'lease_lost';

/**
 * Claims queued workflow runs and executes them through their registered
 * handler, one lease-protected run per slot.
 *
 * - Claims only while below maxConcurrent; each run then waits for a slot on
 *   its LLM provider.
 * - Heartbeats keep the lease; a lost lease or a cancel request aborts the
 *   handler's signal.
 * - Transient failures are retried up to max_attempts; anything else fails
 *   the run and emits a failed event. Expired leases (a crashed worker) are
 *   reclaimed every tick.
 */
@Injectable()
export class WorkflowWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowWorkerService.name);
  readonly workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  private readonly settings: WorkflowWorkerSettings;
  private readonly concurrency: ProviderConcurrencyRegistry;
  private readonly inFlight = new Set<Promise<void>>();
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private stopping = false;

  constructor(
    @Inject(DATABASE_JOB_QUEUE_SERVICE) private readonly queue: DatabaseJobQueueService,
    private readonly runs: WorkflowRunsRepository,
    private readonly handlers: WorkflowHandlerRegistry,
    private readonly observability: ObservabilityService,
    @Inject(CONFIG_PROVIDER_SERVICE) config: ConfigProvider,
  ) {
    this.settings = readWorkflowWorkerSettings(config);
    this.concurrency = new ProviderConcurrencyRegistry(this.settings.providerLimits);
  }

  onModuleInit(): void {
    if (!this.settings.enabled) {
      this.logger.log('Workflow worker disabled (WORKFLOW_WORKER_ENABLED=false)');
      return;
    }
    this.logger.log(`Workflow worker ${this.workerId} polling every ${this.settings.pollMs}ms`);
    this.timer = setInterval(() => void this.safeTick(), this.settings.pollMs);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await Promise.allSettled([...this.inFlight]);
  }

  /** One polling pass: reclaim expired leases, then fill free slots. */
  async tick(): Promise<void> {
    if (this.stopping) return;
    const reclaimed = await this.queue.reclaimExpired(WORKFLOW_RUNS_QUEUE);
    if (reclaimed.requeued.length + reclaimed.failed.length + reclaimed.canceled.length > 0) {
      this.logger.warn(
        `Reclaimed expired runs: requeued ${reclaimed.requeued.length}, failed ${reclaimed.failed.length}, canceled ${reclaimed.canceled.length}`,
      );
    }
    while (!this.stopping && this.inFlight.size < this.settings.maxConcurrent) {
      const row = await this.queue.claimNext({
        queue: WORKFLOW_RUNS_QUEUE,
        workerId: this.workerId,
        leaseSeconds: this.settings.leaseSeconds,
      });
      if (!row) break;
      const task = this.execute(row).finally(() => this.inFlight.delete(task));
      this.inFlight.add(task);
    }
  }

  /** Resolves when every run started so far has finished. For tests and shutdown. */
  async drain(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.allSettled([...this.inFlight]);
    }
  }

  private async safeTick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.tick();
    } catch (err) {
      this.logger.error(`Workflow worker tick failed: ${(err as Error).message}`);
    } finally {
      this.ticking = false;
    }
  }

  private async execute(row: Record<string, unknown>): Promise<void> {
    let run: WorkflowRunRecord;
    try {
      run = toWorkflowRunRecord(row);
    } catch (err) {
      // The row cannot be trusted enough to fail through the repository. Its
      // lease expires and reclaim fails it once attempts run out.
      this.logger.error(`Claimed an unreadable run ${String(row.id)}: ${(err as Error).message}`);
      return;
    }
    try {
      await this.runWithLease(run);
    } catch (err) {
      this.logger.error(`Run ${run.id} bookkeeping failed: ${(err as Error).message}`);
    }
  }

  private async runWithLease(run: WorkflowRunRecord): Promise<void> {
    const started = Date.now();
    const controller = new AbortController();
    let stopReason: StopReason | null = null;
    const stop = (reason: StopReason) => {
      if (stopReason) return;
      stopReason = reason;
      controller.abort(reason);
    };

    const heartbeat = setInterval(() => {
      void this.heartbeat(run, stop);
    }, Math.max(1000, Math.floor((this.settings.leaseSeconds * 1000) / 3)));
    heartbeat.unref();

    let release: (() => void) | null = null;
    try {
      release = await this.concurrency.acquire(run.executionContext.provider);
      const handler = this.handlers.get(run.workflowSlug);
      const outcome = await handler.run({
        run,
        signal: controller.signal,
        reportProgress: (progress) => this.runs.updateProgress(run, this.workerId, progress),
      });
      if (stopReason === 'cancel_requested') {
        await this.runs.markCanceled(run, this.workerId);
        return;
      }
      if (stopReason === 'lease_lost') return;
      try {
        await this.runs.markCompleted(run, this.workerId, outcome.result);
      } catch (err) {
        if (!(err instanceof WorkflowRunTransitionError)) throw err;
        // A cancel arrived after the handler finished: honor it.
        await this.runs.markCanceled(run, this.workerId);
      }
    } catch (err) {
      await this.handleFailure(run, err, stopReason, started);
    } finally {
      clearInterval(heartbeat);
      release?.();
    }
  }

  private async heartbeat(run: WorkflowRunRecord, stop: (reason: StopReason) => void) {
    try {
      const held = await this.queue.heartbeat(
        WORKFLOW_RUNS_QUEUE,
        run.id,
        this.workerId,
        this.settings.leaseSeconds,
      );
      if (!held) {
        stop('lease_lost');
        return;
      }
      const current = await this.runs.getForOrg(run.organizationSlug, run.id);
      if (current?.status === 'cancel_requested') stop('cancel_requested');
    } catch (err) {
      this.logger.error(`Heartbeat for run ${run.id} failed: ${(err as Error).message}`);
    }
  }

  private async handleFailure(
    run: WorkflowRunRecord,
    err: unknown,
    stopReason: StopReason | null,
    started: number,
  ): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    if (stopReason === 'lease_lost') {
      this.logger.warn(`Run ${run.id} lost its lease; another worker or reclaim owns it now`);
      return;
    }
    if (stopReason === 'cancel_requested') {
      await this.runs.markCanceled(run, this.workerId);
      return;
    }
    if (err instanceof WorkflowTransientError && run.attempt < run.maxAttempts) {
      this.logger.warn(`Run ${run.id} attempt ${run.attempt} failed transiently: ${message}`);
      await this.runs.requeueForRetry(run, this.workerId, message);
      return;
    }
    await this.runs.markFailed(run, this.workerId, message);
    await this.observability.emitFailed(
      run.executionContext,
      run.id,
      message,
      Date.now() - started,
    );
  }
}
