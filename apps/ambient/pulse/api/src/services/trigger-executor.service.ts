import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { AmbientDatabaseService, Trigger, TriggerExecution } from '../ambient-database/database.service';
import { AmbientEvent } from '../event-bus/ambient-event.types';
import { StreamingService } from '../streaming/streaming.service';

/**
 * Builds ExecutionContext and dispatches processing when a trigger fires.
 *
 * All agents are reached via HTTP A2A — Forge (port 6200) for langgraph agents,
 * Compose (port 6300) for all others.
 */
@Injectable()
export class TriggerExecutorService {
  private readonly logger = new Logger(TriggerExecutorService.name);

  constructor(
    private readonly database: AmbientDatabaseService,
    private readonly streaming: StreamingService,
    private readonly configService: ConfigService,
  ) {}

  async execute(trigger: Trigger, sourceEvent: AmbientEvent): Promise<void> {
    const startMs = Date.now();
    const executionId = randomUUID();

    const context: ExecutionContext = {
      orgSlug: trigger.org_slug,
      userId: trigger.created_by ?? 'system',
      conversationId: randomUUID(),
      agentSlug: trigger.action_config.agentSlug,
      agentType: trigger.action_config.agentType ?? 'context',
      provider: (trigger.action_config.provider !== 'default' && trigger.action_config.provider)
        ? trigger.action_config.provider
        : this.configService.getOrThrow<string>('DEFAULT_LLM_PROVIDER'),
      model: (trigger.action_config.model !== 'default' && trigger.action_config.model)
        ? trigger.action_config.model
        : this.configService.getOrThrow<string>('DEFAULT_LLM_MODEL'),
    };

    const pendingExecution: TriggerExecution = {
      id: executionId,
      trigger_id: trigger.id,
      trigger_name: trigger.name,
      source_type: trigger.source_type,
      product: 'pulse',
      source_event: sourceEvent.payload,
      condition_met: true,
      action_taken: true,
      skip_reason: null,
      execution_context: context,
      a2a_response: null,
      duration_ms: null,
      status: 'fired',
    };

    try {
      await this.database.insertExecution(pendingExecution);
    } catch (err) {
      this.logger.error(
        `Failed to insert pending execution ${executionId}: ${(err as Error).message}`,
      );
    }

    const mode = trigger.action_config.mode ?? 'converse';
    const action = trigger.action_config.action ?? 'execute';

    // Merge static payload from action_config with dynamic event data.
    const mergedPayload = {
      ...(trigger.action_config.payload ?? {}),
      ...(sourceEvent.sourceType === 'database' ? { event: sourceEvent.payload } : {}),
    };

    await this.executeRemote(
      executionId,
      trigger,
      mode,
      action,
      mergedPayload,
      context,
      startMs,
    );
  }

  /**
   * Remote A2A execution — HTTP call to Forge or Compose based on agentType.
   */
  private async executeRemote(
    executionId: string,
    trigger: Trigger,
    mode: string,
    action: string,
    payload: Record<string, unknown>,
    context: ExecutionContext,
    startMs: number,
  ): Promise<void> {
    const a2aRequest = {
      jsonrpc: '2.0' as const,
      id: executionId,
      method: `${mode}.${action}`,
      params: {
        context,
        mode,
        userMessage: this.buildUserMessage(trigger, { sourceType: trigger.source_type, payload } as AmbientEvent),
        payload,
      },
    };

    const targetPort = trigger.action_config.agentType === 'langgraph' ? 6200 : 6300;
    const targetUrl = `http://localhost:${targetPort}/agent-to-agent/internal/tasks`;

    this.logger.log(
      `Firing remote A2A call for trigger "${trigger.name}" → ${targetUrl} method=${a2aRequest.method}`,
    );

    try {
      const serviceKey = process.env['INTERNAL_SERVICE_KEY'];
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (serviceKey) {
        headers['x-internal-service-key'] = serviceKey;
      }

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(a2aRequest),
      });

      const responseData = (await response.json()) as Record<string, unknown>;
      const httpOk = response.ok;
      const durationMs = Date.now() - startMs;

      await this.database.updateExecution(executionId, {
        a2a_response: responseData,
        duration_ms: durationMs,
        status: httpOk ? 'completed' : 'failed',
      });

      await this.database.updateTriggerLastFired(trigger.id);

      this.streaming.emitWorkflowCompleted(trigger.id, {
        executionId,
        durationMs,
        response: responseData,
      });

      this.logger.log(
        `Remote A2A call completed for trigger "${trigger.name}" — status=${httpOk ? 'completed' : 'failed'} durationMs=${durationMs}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const durationMs = Date.now() - startMs;

      this.logger.error(
        `Remote A2A call failed for trigger "${trigger.name}": ${message} (durationMs=${durationMs})`,
      );

      try {
        await this.database.updateExecution(executionId, {
          a2a_response: { error: message },
          duration_ms: durationMs,
          status: 'failed',
        });
      } catch (dbErr) {
        this.logger.error(
          `Failed to update execution ${executionId} after remote failure: ${(dbErr as Error).message}`,
        );
      }

      this.streaming.emitWorkflowFailed(trigger.id, message);
    }
  }

  private buildUserMessage(trigger: Trigger, event: AmbientEvent): string {
    if (trigger.action_config.messageTemplate) {
      return trigger.action_config.messageTemplate;
    }
    return `Ambient trigger "${trigger.name}" fired: ${JSON.stringify(event.payload)}`;
  }
}
