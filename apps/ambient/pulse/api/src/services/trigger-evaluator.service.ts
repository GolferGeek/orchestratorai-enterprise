import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Subscription } from 'rxjs';
import { randomUUID } from 'crypto';
import { AmbientEventBusService } from '../event-bus/ambient-event-bus.service';
import { AmbientEvent } from '../event-bus/ambient-event.types';
import { AmbientDatabaseService, Trigger, TriggerExecution } from '../ambient-database/database.service';
import { TriggerExecutorService } from './trigger-executor.service';

/**
 * Subscribes to the ambient event bus and evaluates trigger conditions.
 *
 * For each AmbientEvent:
 *   1. Loads matching triggers (by source_type and optional triggerId)
 *   2. Checks conditions (field matching against trigger.condition)
 *   3. Checks cooldown (last_fired_at + cooldown_seconds)
 *   4. Checks rate limit (max_fires_per_hour via recent execution count)
 *   5. If all checks pass → calls TriggerExecutorService
 *   6. If skipped → records a skipped execution with skip_reason
 */
@Injectable()
export class TriggerEvaluatorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TriggerEvaluatorService.name);
  private subscription: Subscription | null = null;

  constructor(
    private readonly eventBus: AmbientEventBusService,
    private readonly database: AmbientDatabaseService,
    private readonly executor: TriggerExecutorService,
  ) {}

  onModuleInit(): void {
    this.subscription = this.eventBus.events$.subscribe((event) => {
      this.evaluateEvent(event).catch((err: Error) => {
        this.logger.error(`Error evaluating ambient event: ${err.message}`);
      });
    });
    this.logger.log('TriggerEvaluatorService subscribed to event bus');
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
    this.logger.log('TriggerEvaluatorService unsubscribed from event bus');
  }

  private async evaluateEvent(event: AmbientEvent): Promise<void> {
    this.logger.debug(`Evaluating event: sourceType=${event.sourceType} triggerId=${event.triggerId ?? 'none'}`);

    let triggers: Trigger[];
    try {
      triggers = await this.database.getTriggersByProduct('pulse');
    } catch (err) {
      this.logger.error(`Failed to load triggers for evaluation: ${(err as Error).message}`);
      return;
    }

    // Filter to triggers that match this event's source type.
    // If the event has a specific triggerId (from a real subscription), only
    // evaluate that trigger. Otherwise evaluate all triggers of that source_type.
    const matching = triggers.filter((trigger) => {
      if (trigger.source_type !== event.sourceType) {
        return false;
      }
      if (event.triggerId && trigger.id !== event.triggerId) {
        return false;
      }
      return true;
    });

    if (matching.length === 0) {
      this.logger.debug(`No matching triggers for event sourceType=${event.sourceType}`);
      return;
    }

    for (const trigger of matching) {
      await this.evaluateTrigger(trigger, event);
    }
  }

  private async evaluateTrigger(trigger: Trigger, event: AmbientEvent): Promise<void> {
    // --- Condition check ---
    const conditionMet = this.checkCondition(trigger, event);
    if (!conditionMet) {
      await this.recordSkipped(trigger, event, 'condition_not_met');
      return;
    }

    // --- Cooldown check ---
    if (trigger.cooldown_seconds > 0 && trigger.last_fired_at) {
      const lastFired = new Date(trigger.last_fired_at).getTime();
      const cooldownEndsAt = lastFired + trigger.cooldown_seconds * 1000;
      if (Date.now() < cooldownEndsAt) {
        this.logger.debug(
          `Trigger "${trigger.name}" in cooldown — skipping (cooldown ends at ${new Date(cooldownEndsAt).toISOString()})`,
        );
        await this.recordSkipped(trigger, event, 'cooldown');
        return;
      }
    }

    // --- Rate limit check ---
    if (trigger.max_fires_per_hour != null) {
      let recentCount = 0;
      try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const recent = await this.database.getRecentExecutions(trigger.id, 1000);
        recentCount = recent.filter(
          (e) =>
            e.action_taken &&
            e.status !== 'skipped' &&
            (e as unknown as { fired_at: string }).fired_at >= oneHourAgo,
        ).length;
      } catch (err) {
        this.logger.error(
          `Failed to count recent executions for rate limit check: ${(err as Error).message}`,
        );
      }

      if (recentCount >= trigger.max_fires_per_hour) {
        this.logger.debug(
          `Trigger "${trigger.name}" hit rate limit (${recentCount}/${trigger.max_fires_per_hour} per hour) — skipping`,
        );
        await this.recordSkipped(trigger, event, 'rate_limit');
        return;
      }
    }

    // --- Execute ---
    this.logger.log(`Trigger "${trigger.name}" passed all checks — executing`);
    await this.executor.execute(trigger, event);
  }

  /**
   * Simple field-equality condition check.
   * trigger.condition is expected to be a flat map of field → expected value.
   * All fields must match the event payload for the condition to pass.
   * If no condition is configured, always returns true.
   */
  private checkCondition(trigger: Trigger, event: AmbientEvent): boolean {
    if (!trigger.condition || Object.keys(trigger.condition).length === 0) {
      return true;
    }

    for (const [field, expected] of Object.entries(trigger.condition)) {
      const actual = event.payload[field];
      if (actual !== expected) {
        this.logger.debug(
          `Condition check failed for trigger "${trigger.name}": field=${field} expected=${String(expected)} actual=${String(actual)}`,
        );
        return false;
      }
    }

    return true;
  }

  private async recordSkipped(
    trigger: Trigger,
    event: AmbientEvent,
    skipReason: 'cooldown' | 'rate_limit' | 'condition_not_met' | 'duplicate',
  ): Promise<void> {
    const execution: TriggerExecution = {
      id: randomUUID(),
      trigger_id: trigger.id,
      trigger_name: trigger.name,
      source_type: trigger.source_type,
      product: 'pulse',
      source_event: event.payload,
      condition_met: skipReason !== 'condition_not_met',
      action_taken: false,
      skip_reason: skipReason,
      execution_context: null,
      a2a_response: null,
      duration_ms: null,
      status: 'skipped',
    };

    try {
      await this.database.insertExecution(execution);
    } catch (err) {
      this.logger.error(
        `Failed to record skipped execution for trigger "${trigger.name}": ${(err as Error).message}`,
      );
    }
  }
}
