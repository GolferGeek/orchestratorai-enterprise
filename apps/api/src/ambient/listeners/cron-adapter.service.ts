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
 *   1. Loads active 'cron' triggers from ambient.triggers
 *   2. Creates a CronJob per trigger using the configured cron expression
 *   3. Emits AmbientEvents to the event bus when each job fires
 *
 * A created, changed or deleted trigger is rescheduled at once (sync /
 * unschedule, called by the triggers API), so no restart is needed.
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
    if (!this.registry.listenersEnabled) {
      this.logger.log('Cron Adapter off (AMBIENT_LISTENERS_ENABLED=false)');
      return;
    }
    this.registry.register(this.LISTENER_ID, 'cron', 'Cron Adapter');
    this.registry.activate(this.LISTENER_ID);
    this.logger.log('Cron Adapter initialized — loading triggers from database');

    const triggers = await this.database.getEnabledTriggersBySource('cron');

    if (triggers.length === 0) {
      this.logger.log('No active cron triggers found');
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

  /** Bring a trigger's job in line with the trigger: (re)schedule an enabled cron trigger, drop anything else. */
  sync(trigger: Trigger): void {
    this.unschedule(trigger.id);
    if (trigger.enabled && trigger.source_type === 'cron') this.scheduleTrigger(trigger);
  }

  unschedule(triggerId: string): void {
    const job = this.jobs.get(triggerId);
    if (!job) return;
    job.stop();
    this.jobs.delete(triggerId);
    this.logger.log(`Unscheduled cron job for trigger ${triggerId}`);
  }

  /** Scheduled trigger ids (for the listeners view and specs). */
  scheduledTriggerIds(): string[] {
    return [...this.jobs.keys()];
  }

  private scheduleTrigger(trigger: Trigger): void {
    const config = trigger.source_config as {
      expression?: string;
      timezone?: string;
    };

    const expression = config.expression;
    if (!expression) {
      throw new Error(
        `Cron trigger "${trigger.name}" (${trigger.id}) requires source_config.expression`,
      );
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
      orgSlug: trigger.org_slug,
      sourceType: 'cron',
      triggerId: trigger.id,
      triggerName: trigger.name,
      payload: {
        expression: (trigger.source_config as { expression?: string }).expression ?? 'unknown',
        firedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });

    this.streaming.emitListenerFired(trigger.org_slug, 'cron', trigger.name, {
      triggerId: trigger.id,
      triggerName: trigger.name,
    });
  }
}
