import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Subscription } from 'rxjs';
import { TERMINAL_WORKFLOW_RUN_STATUSES, type InvokeOutput } from '@orchestrator-ai/transport-types';
import { ObservabilityEventsService } from '@orchestratorai/planes/observability';
import { CONFIG_PROVIDER_SERVICE, type ConfigProvider } from '@orchestratorai/planes/config';
import { InvokeDispatchService } from '../../agents/invoke/invoke-dispatch.service';
import { WorkflowRunsRepository, type WorkflowRunRecord } from '../../workflows/shared/runs';
import { ReplyRefused } from '../../gatehouse/reply.service';
import type { A2APart } from '../../gatehouse/a2a-v1';
import { outputParts } from '../../gatehouse/a2a-inbound';
import { AmbientDatabaseService } from '../ambient-database/database.service';
import { createSystemTriggeredContext } from '../automation-context/automation-context';
import type { EventOrigin } from '../event-bus/ambient-event.types';

const RUN_ENDED = new Set(['langgraph.completed', 'langgraph.failed', 'langgraph.canceled']);

/**
 * Ambient's response to a Gatehouse caller: a trigger with replyToCaller sends
 * its result back through the A2A agent the event came in on. Ambient only
 * invokes that agent (in reply mode); the agent calls the caller. An agent
 * action replies at once; a workflow action's reply waits (in the execution
 * row) for its run to end, found by the run's end event or, after a restart,
 * by the sweep at start-up.
 */
@Injectable()
export class TriggerRepliesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TriggerRepliesService.name);
  private subscription: Subscription | null = null;

  constructor(
    private readonly database: AmbientDatabaseService,
    private readonly dispatch: InvokeDispatchService,
    private readonly runs: WorkflowRunsRepository,
    private readonly observability: ObservabilityEventsService,
    @Inject(CONFIG_PROVIDER_SERVICE) private readonly config: ConfigProvider,
  ) {}

  onModuleInit(): void {
    this.subscription = this.observability.events$.subscribe((event) => {
      if (!RUN_ENDED.has(event.hook_event_type)) return;
      this.runEnded(event.context.conversationId).catch((error: Error) =>
        this.logger.error(`Reply after run ${event.context.conversationId} failed: ${error.message}`),
      );
    });
    this.sweep().catch((error: Error) => this.logger.error(`Sweeping waiting replies failed: ${error.message}`));
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  /** Send a result to the event's caller now, recording how it went on the execution. */
  async reply(executionId: string, orgSlug: string, origin: EventOrigin, parts: A2APart[]): Promise<void> {
    const context = createSystemTriggeredContext({
      orgSlug,
      agentSlug: origin.via,
      provider: this.config.getRequired('DEFAULT_LLM_PROVIDER'),
      model: this.config.getRequired('DEFAULT_LLM_MODEL'),
      conversationId: randomUUID(),
    });
    try {
      const output = await this.dispatch.invoke(context, { content: { parts }, contentType: 'json' }, {
        source: 'ambient',
        a2aReply: origin,
        executionId,
      });
      await this.database.updateExecution(executionId, { reply_state: 'sent', reply: output.content as Record<string, unknown> });
    } catch (error) {
      const refused = error instanceof ReplyRefused;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Reply for execution ${executionId} ${refused ? 'refused' : 'failed'}: ${message}`);
      await this.database.updateExecution(executionId, { reply_state: refused ? 'refused' : 'failed', reply: { error: message } });
    }
  }

  /** A run ended: send every reply that waited on it. */
  async runEnded(runId: string): Promise<void> {
    for (const execution of await this.database.getWaitingReplies(runId)) {
      if (!execution.event_id) throw new Error(`Execution ${execution.id} waits to reply but has no event`);
      const event = await this.database.getEventById(execution.event_id);
      if (!event?.origin) throw new Error(`Execution ${execution.id} waits to reply to an event with no caller`);
      const run = await this.runs.getForOrg(event.org_slug, runId);
      if (!run) throw new Error(`Execution ${execution.id} waits on run ${runId}, which is gone`);
      if (!TERMINAL_WORKFLOW_RUN_STATUSES.includes(run.status)) continue;
      if (!(await this.database.claimReply(execution.id))) continue;
      await this.reply(execution.id, event.org_slug, event.origin, runParts(run));
    }
  }

  private async sweep(): Promise<void> {
    const runIds = new Set((await this.database.getWaitingReplies()).map((execution) => execution.reply_run_id!));
    for (const runId of runIds) await this.runEnded(runId);
  }
}

/** An agent's answer as reply parts, as the Gatehouse answers a caller directly. */
export const answerParts = (output: InvokeOutput): A2APart[] => outputParts(output);

/** A finished run as reply parts: its result, or what became of it. */
export function runParts(run: Pick<WorkflowRunRecord, 'status' | 'result' | 'workflowSlug'>): A2APart[] {
  if (run.status === 'completed') {
    return run.result === null ? [{ text: `${run.workflowSlug} completed` }] : [{ data: run.result, mediaType: 'application/json' }];
  }
  return [{ text: run.status === 'canceled' ? `${run.workflowSlug} was canceled` : `${run.workflowSlug} failed` }];
}
