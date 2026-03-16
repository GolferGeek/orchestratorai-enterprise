import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { CronJob } from 'cron';
import { ListenerRegistryService } from './listener-registry.service';
import { StreamingService } from '../streaming/streaming.service';
import { AmbientEventBusService } from '../event-bus/ambient-event-bus.service';
import { AmbientDatabaseService, Trigger } from '../ambient-database/database.service';

/**
 * Cron adapter — creates CronJob instances from trigger source_config.expression.
 *
 * On init:
 *   1. Loads active 'cron' triggers for product='pulse' from ambient.triggers
 *   2. Creates a CronJob per trigger using the configured cron expression
 *   3. Emits AmbientEvents to the event bus when each job fires
 *
 * Clean up on destroy: stops all CronJob instances.
 */
@Injectable()
export class CronAdapterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CronAdapterService.name);
  private readonly LISTENER_ID = 'cron-adapter-main';
  private readonly jobs = new Map<string, CronJob>();

  constructor(
    private readonly registry: ListenerRegistryService,
    private readonly streaming: StreamingService,
    private readonly eventBus: AmbientEventBusService,
    private readonly database: AmbientDatabaseService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registry.register(this.LISTENER_ID, 'cron', 'Cron Adapter');
    this.registry.activate(this.LISTENER_ID);
    this.logger.log('Cron Adapter initialized — loading triggers from database');

    let triggers: Trigger[] = [];
    try {
      triggers = await this.database.getTriggersByProductAndSource('pulse', 'cron');
    } catch (err) {
      this.logger.error(`Failed to load cron triggers: ${(err as Error).message}`);
      return;
    }

    if (triggers.length === 0) {
      this.logger.log('No active cron triggers found for product=pulse');
      return;
    }

    for (const trigger of triggers) {
      this.scheduleTrigger(trigger);
    }

    this.logger.log(`Cron Adapter scheduled ${triggers.length} cron job(s)`);
  }

  onModuleDestroy(): void {
    for (const [triggerId, job] of this.jobs.entries()) {
      job.stop();
      this.logger.debug(`Stopped cron job for trigger ${triggerId}`);
    }
    this.jobs.clear();
    this.registry.deactivate(this.LISTENER_ID);
    this.logger.log('Cron Adapter stopped — all cron jobs stopped');
  }

  private scheduleTrigger(trigger: Trigger): void {
    const config = trigger.source_config as {
      expression?: string;
      timezone?: string;
    };

    const expression = config.expression;
    if (!expression) {
      this.logger.warn(
        `Trigger "${trigger.name}" (${trigger.id}) has no expression in source_config — skipping`,
      );
      return;
    }

    this.logger.log(
      `Scheduling cron job for trigger "${trigger.name}" with expression "${expression}"`,
    );

    const job = new CronJob(
      expression,
      () => {
        this.handleCronFire(trigger);
      },
      null,
      true,
      config.timezone,
    );

    this.jobs.set(trigger.id, job);
  }

  private handleCronFire(trigger: Trigger): void {
    this.registry.recordFiring(this.LISTENER_ID);
    this.logger.log(`Cron trigger fired: "${trigger.name}"`);

    this.eventBus.emit({
      sourceType: 'cron',
      triggerId: trigger.id,
      triggerName: trigger.name,
      payload: {
        expression: (trigger.source_config as { expression?: string }).expression ?? 'unknown',
        firedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });

    this.streaming.emitListenerFired('cron', trigger.name, {
      triggerId: trigger.id,
      triggerName: trigger.name,
    });
  }
}
