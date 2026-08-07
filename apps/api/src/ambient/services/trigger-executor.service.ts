import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { ExecutionContext, InvokeData } from '@orchestrator-ai/transport-types';
import { AmbientDatabaseService, Trigger, TriggerExecution } from '../ambient-database/database.service';
import { AmbientEvent } from '../event-bus/ambient-event.types';
import { StreamingService } from '../streaming/streaming.service';
import { createSystemTriggeredContext } from '../automation-context/automation-context';
import { InvokeDispatchService } from '../../agents/invoke/invoke-dispatch.service';

/**
 * Builds ExecutionContext and dispatches processing when a trigger fires.
 *
 * All agents are reached through the unified in-process invoke dispatcher.
 */
@Injectable()
export class TriggerExecutorService {
  private readonly logger = new Logger(TriggerExecutorService.name);

  constructor(
    private readonly database: AmbientDatabaseService,
    private readonly streaming: StreamingService,
    private readonly configService: ConfigService,
    private readonly invokeDispatch: InvokeDispatchService,
  ) {}

  async execute(trigger: Trigger, sourceEvent: AmbientEvent): Promise<void> {
    const startMs = Date.now();
    const executionId = randomUUID();

    const context: ExecutionContext = createSystemTriggeredContext({
      orgSlug: trigger.org_slug,
      agentSlug: trigger.action_config.agentSlug,
      provider: (trigger.action_config.provider !== 'default' && trigger.action_config.provider)
        ? trigger.action_config.provider
        : this.configService.getOrThrow<string>('DEFAULT_LLM_PROVIDER'),
      model: (trigger.action_config.model !== 'default' && trigger.action_config.model)
        ? trigger.action_config.model
        : this.configService.getOrThrow<string>('DEFAULT_LLM_MODEL'),
      conversationId: randomUUID(),
    });

    const pendingExecution: TriggerExecution = {
      id: executionId,
      trigger_id: trigger.id,
      trigger_name: trigger.name,
      source_type: trigger.source_type,
      source_event: sourceEvent.payload,
      condition_met: true,
      action_taken: true,
      skip_reason: null,
      execution_context: context,
      a2a_response: null,
      duration_ms: null,
      status: 'fired',
    };

    await this.database.insertExecution(pendingExecution);

    // Merge static payload from action_config with dynamic event data.
    const mergedPayload = {
      ...(trigger.action_config.payload ?? {}),
      ...(sourceEvent.sourceType === 'database' ? { event: sourceEvent.payload } : {}),
    };

    await this.executeRemote(
      executionId,
      trigger,
      mergedPayload,
      context,
      startMs,
    );
  }

  /**
   * Unified invoke execution through the copied Agents invoke module.
   */
  private async executeRemote(
    executionId: string,
    trigger: Trigger,
    payload: Record<string, unknown>,
    context: ExecutionContext,
    startMs: number,
  ): Promise<void> {
    const data: InvokeData = {
      content: {
        message: this.buildUserMessage(trigger, { sourceType: trigger.source_type, payload } as AmbientEvent),
        payload,
      },
      contentType: 'json',
    };

    this.logger.log(
      `Firing ambient invoke for trigger "${trigger.name}" agent=${context.agentSlug}`,
    );

    try {
      const output = await this.invokeDispatch.invoke(context, data, {
        source: 'ambient',
        triggerId: trigger.id,
        triggerName: trigger.name,
        sourceType: trigger.source_type,
        createdBy: trigger.created_by,
      });
      const durationMs = Date.now() - startMs;

      await this.database.updateExecution(executionId, {
        a2a_response: { output },
        duration_ms: durationMs,
        status: 'completed',
      });

      await this.database.updateTriggerLastFired(trigger.id);

      this.streaming.emitWorkflowCompleted(trigger.org_slug, trigger.id, {
        executionId,
        durationMs,
        response: output,
      });

      this.logger.log(
        `Ambient invoke completed for trigger "${trigger.name}" durationMs=${durationMs}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const durationMs = Date.now() - startMs;

      this.logger.error(
        `Ambient invoke failed for trigger "${trigger.name}": ${message} (durationMs=${durationMs})`,
      );

      await this.database.updateExecution(executionId, {
        a2a_response: { error: message },
        duration_ms: durationMs,
        status: 'failed',
      });

      this.streaming.emitWorkflowFailed(
        trigger.org_slug,
        trigger.id,
        message,
      );
      throw err;
    }
  }

  private buildUserMessage(trigger: Trigger, event: AmbientEvent): string {
    if (trigger.action_config.messageTemplate) {
      return trigger.action_config.messageTemplate;
    }
    return `Ambient trigger "${trigger.name}" fired: ${JSON.stringify(event.payload)}`;
  }
}
