import { eventValue } from '../event-bus/event-path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { ExecutionContext, InvokeData, JsonValue } from '@orchestrator-ai/transport-types';
import { AmbientDatabaseService, Trigger, TriggerExecution } from '../ambient-database/database.service';
import { AmbientEvent } from '../event-bus/ambient-event.types';
import { StreamingService } from '../streaming/streaming.service';
import { createSystemTriggeredContext } from '../automation-context/automation-context';
import { InvokeDispatchService } from '../../agents/invoke/invoke-dispatch.service';
import { WorkflowRunLauncher } from '../../workflows/invoke/workflow-run-launcher.service';
import { answerParts, TriggerRepliesService } from './trigger-replies.service';

/**
 * Builds ExecutionContext and dispatches processing when a trigger fires.
 *
 * An agent trigger is reached through the unified in-process invoke
 * dispatcher; a workflow trigger queues a runtime run through the same
 * launcher a person's start uses, as the system user, readable by the org.
 */
@Injectable()
export class TriggerExecutorService {
  private readonly logger = new Logger(TriggerExecutorService.name);

  constructor(
    private readonly database: AmbientDatabaseService,
    private readonly streaming: StreamingService,
    private readonly configService: ConfigService,
    private readonly invokeDispatch: InvokeDispatchService,
    private readonly launcher: WorkflowRunLauncher,
    private readonly replies: TriggerRepliesService,
  ) {}

  async execute(trigger: Trigger, sourceEvent: AmbientEvent): Promise<void> {
    const startMs = Date.now();
    const executionId = randomUUID();

    const { workflowSlug, agentSlug } = trigger.action_config;
    const target = workflowSlug ?? agentSlug;
    if (!target) {
      throw new Error(`Trigger "${trigger.name}" (${trigger.id}) names neither an agent nor a workflow`);
    }
    const context: ExecutionContext = createSystemTriggeredContext({
      orgSlug: trigger.org_slug,
      agentSlug: target,
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
      event_id: sourceEvent.pushed?.id ?? null,
    };

    await this.database.insertExecution(pendingExecution);

    if (workflowSlug) {
      await this.launchWorkflow(executionId, trigger, workflowSlug, context, startMs, sourceEvent);
      return;
    }

    // Merge static payload from action_config with dynamic event data.
    const mergedPayload = {
      ...(trigger.action_config.payload ?? {}),
      ...(sourceEvent.sourceType === 'database' || sourceEvent.sourceType === 'event'
        ? { event: sourceEvent.payload }
        : {}),
    };

    await this.executeRemote(
      executionId,
      trigger,
      mergedPayload,
      context,
      startMs,
      sourceEvent,
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
    sourceEvent: AmbientEvent,
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

      const origin = replyOrigin(trigger, sourceEvent);
      if (origin) {
        await this.database.updateExecution(executionId, { reply_state: 'sending' });
        await this.replies.reply(executionId, trigger.org_slug, origin, answerParts(output));
      }

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

  /**
   * Queue a workflow run. The fire completes when the run is queued; the run
   * itself (its progress, any human review) lives in workflows.runs. Its input
   * is the trigger's `input`, checked by the workflow like any start.
   */
  private async launchWorkflow(
    executionId: string,
    trigger: Trigger,
    workflowSlug: string,
    context: ExecutionContext,
    startMs: number,
    sourceEvent: AmbientEvent,
  ): Promise<void> {
    const entry = await this.launcher.runtimeEntry(workflowSlug, trigger.org_slug);
    const launched = entry.ok
      ? await this.launcher.launch(entry.value, {
          context,
          input: workflowInput(trigger, sourceEvent),
          accessControl: { mode: 'org' },
          queuedMessage: `Run queued by trigger "${trigger.name}"`,
        })
      : entry;
    const durationMs = Date.now() - startMs;
    if (!launched.ok) {
      await this.database.updateExecution(executionId, {
        a2a_response: { error: launched.message },
        duration_ms: durationMs,
        status: 'failed',
      });
      this.streaming.emitWorkflowFailed(trigger.org_slug, trigger.id, launched.message);
      throw new Error(`Trigger "${trigger.name}" could not start ${workflowSlug}: ${launched.message}`);
    }
    const origin = replyOrigin(trigger, sourceEvent);
    await this.database.updateExecution(executionId, {
      a2a_response: { runId: launched.value.id, status: launched.value.status },
      duration_ms: durationMs,
      status: 'completed',
      // The run's result goes back to the caller when the run ends.
      ...(origin ? { reply_state: 'waiting' as const, reply_run_id: launched.value.id } : {}),
    });
    await this.database.updateTriggerLastFired(trigger.id);
    this.streaming.emitWorkflowCompleted(trigger.org_slug, trigger.id, {
      executionId,
      durationMs,
      response: { runId: launched.value.id },
    });
    this.logger.log(`Trigger "${trigger.name}" queued ${workflowSlug} run ${launched.value.id}`);
  }

  private buildUserMessage(trigger: Trigger, event: AmbientEvent): string {
    if (trigger.action_config.messageTemplate) {
      return trigger.action_config.messageTemplate;
    }
    return `Ambient trigger "${trigger.name}" fired: ${JSON.stringify(event.payload)}`;
  }
}

/**
 * A workflow trigger's start input: its fixed `input`, plus fields read from
 * the event (`inputFromEvent`, e.g. { hireId: 'new.id' } for a database
 * insert). A path the event does not have fails the fire - the run never
 * starts with part of its input missing.
 */
export function workflowInput(trigger: Trigger, event: AmbientEvent): JsonValue {
  const fixed = trigger.action_config.input ?? null;
  const mapping = trigger.action_config.inputFromEvent;
  if (!mapping) return fixed;
  if (fixed !== null && (typeof fixed !== 'object' || Array.isArray(fixed))) {
    throw new Error(`Trigger "${trigger.name}": input must be an object to add event fields to`);
  }
  const fromEvent: Record<string, JsonValue> = {};
  for (const [field, path] of Object.entries(mapping)) {
    const value = eventValue(event.payload, path);
    if (value === undefined || value === null) throw new Error(`Trigger "${trigger.name}": the event has no ${path} for input.${field}`);
    fromEvent[field] = value as JsonValue;
  }
  return { ...(fixed ?? {}), ...fromEvent };
}

/** The caller to reply to: only for a trigger that asks, and an event a Gatehouse caller pushed. */
function replyOrigin(trigger: Trigger, event: AmbientEvent) {
  return trigger.action_config.replyToCaller === true ? event.pushed?.origin : undefined;
}
