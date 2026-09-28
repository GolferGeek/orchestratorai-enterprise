import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CONFIG_PROVIDER_SERVICE, type ConfigProvider } from '@orchestratorai/planes/config';
import { InvokeDispatchService } from '../agents/invoke/invoke-dispatch.service';
import type { AgentDefinition } from '../agents/invoke/agent-definition.types';
import { createSystemTriggeredContext } from '../ambient/automation-context/automation-context';
import { WorkflowRunsRepository } from '../workflows/shared/runs';
import {
  A2A_ERRORS,
  A2ARpcError,
  invokeData,
  isTerminal,
  outputParts,
  parseSendMessage,
  runTaskState,
  TaskRow,
  TaskState,
  wireTask,
} from './a2a-inbound';
import type { Caller } from './callers.repository';
import { TasksRepository } from './tasks.repository';

const WIRE_TO_STATE: Record<string, TaskState> = {
  TASK_STATE_SUBMITTED: 'submitted',
  TASK_STATE_WORKING: 'working',
  TASK_STATE_COMPLETED: 'completed',
  TASK_STATE_FAILED: 'failed',
  TASK_STATE_CANCELED: 'canceled',
  TASK_STATE_REJECTED: 'rejected',
};

/**
 * What a registered caller can ask of one of our published A2A agents. Each
 * SendMessage is a task; the agent fires its target as the system user in
 * the agent's org, with the caller in metadata. A task that started a workflow
 * run follows the run.
 */
@Injectable()
export class GatehouseInboundService {
  private readonly logger = new Logger(GatehouseInboundService.name);

  constructor(
    private readonly tasks: TasksRepository,
    private readonly dispatch: InvokeDispatchService,
    private readonly runs: WorkflowRunsRepository,
    @Inject(CONFIG_PROVIDER_SERVICE) private readonly config: ConfigProvider,
  ) {}

  async handle(method: string, params: unknown, agent: AgentDefinition, caller: Caller): Promise<unknown> {
    switch (method) {
      case 'SendMessage':
        return { task: wireTask(await this.sendMessage(params, agent, caller)) };
      case 'GetTask':
        return wireTask(await this.refreshed(await this.ownTask(params, agent, caller)));
      case 'ListTasks':
        return this.listTasks(params, agent, caller);
      case 'CancelTask':
        return wireTask(await this.cancel(await this.ownTask(params, agent, caller)));
      case 'SendStreamingMessage':
      case 'SubscribeToTask':
        throw new A2ARpcError(A2A_ERRORS.unsupportedOperation, 'This agent does not stream (capabilities.streaming is false)');
      case 'CreateTaskPushNotificationConfig':
      case 'GetTaskPushNotificationConfig':
      case 'ListTaskPushNotificationConfigs':
      case 'DeleteTaskPushNotificationConfig':
        throw new A2ARpcError(A2A_ERRORS.pushNotificationNotSupported, 'Push notifications are not supported');
      case 'GetExtendedAgentCard':
        throw new A2ARpcError(A2A_ERRORS.unsupportedOperation, 'There is no extended agent card');
      default:
        throw new A2ARpcError(A2A_ERRORS.methodNotFound, `Method ${method} not found`);
    }
  }

  private async sendMessage(params: unknown, agent: AgentDefinition, caller: Caller): Promise<TaskRow> {
    const message = parseSendMessage(params);
    if (message.taskId !== undefined) {
      await this.ownTask({ id: message.taskId }, agent, caller);
      throw new A2ARpcError(A2A_ERRORS.unsupportedOperation, 'Continuing an existing task is not supported; send a new message');
    }
    const data = invokeData(message.parts);
    const target = agent.a2a!.target.kind;
    const task = await this.tasks.create({
      id: randomUUID(),
      agentSlug: agent.slug,
      orgSlug: agent.orgSlug!,
      callerId: caller.id,
      contextId: message.contextId ?? randomUUID(),
      target,
    });
    const context = createSystemTriggeredContext({
      orgSlug: agent.orgSlug!,
      agentSlug: agent.slug,
      provider: this.config.getRequired('DEFAULT_LLM_PROVIDER'),
      model: this.config.getRequired('DEFAULT_LLM_MODEL'),
      conversationId: task.id,
    });

    try {
      const output = await this.dispatch.invoke(context, data, {
        source: 'gatehouse',
        caller: { id: caller.id, name: caller.name, cardUrl: caller.cardUrl },
        a2aTask: { id: task.id, contextId: task.contextId },
      });
      if (target === 'workflow') {
        const runId = (output.content as { runId?: unknown }).runId;
        if (typeof runId !== 'string') throw new Error(`A2A agent ${agent.slug} started a workflow but returned no run id`);
        return await this.tasks.update(task.id, { state: 'submitted', runId, statusMessage: 'Queued' });
      }
      if (target === 'ambient') {
        const eventId = (output.content as { eventId?: unknown }).eventId;
        if (typeof eventId !== 'string') throw new Error(`A2A agent ${agent.slug} pushed an event but returned no event id`);
        return await this.tasks.update(task.id, { state: 'completed', eventId, artifact: outputParts(output) });
      }
      return await this.tasks.update(task.id, { state: 'completed', artifact: outputParts(output) });
    } catch (error) {
      // The caller learns only that it failed; the detail stays with us.
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`A2A task ${task.id} (${agent.slug}, caller ${caller.name}) failed: ${detail}`);
      return this.tasks.update(task.id, { state: 'failed', statusMessage: 'The agent could not complete this request', error: detail });
    }
  }

  private async ownTask(params: unknown, agent: AgentDefinition, caller: Caller): Promise<TaskRow> {
    const id = (params as { id?: unknown } | null)?.id;
    if (typeof id !== 'string' || !id) throw new A2ARpcError(A2A_ERRORS.invalidParams, 'params.id must be a task id');
    // Our task ids are UUIDs: anything else names no task of ours.
    const task = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      ? await this.tasks.getForCaller(id, caller.id, agent.slug)
      : null;
    if (!task) throw new A2ARpcError(A2A_ERRORS.taskNotFound, `Task ${id} not found`);
    return task;
  }

  /** A task backed by a workflow run, brought up to date with the run. */
  private async refreshed(task: TaskRow): Promise<TaskRow> {
    if (!task.runId || isTerminal(task.state)) return task;
    const run = await this.runs.getForOrg(task.orgSlug, task.runId);
    if (!run) throw new Error(`A2A task ${task.id} follows run ${task.runId}, which is gone`);
    const now = runTaskState(run, task.orgSlug);
    if (now.state === task.state && now.statusMessage === task.statusMessage) return task;
    return this.tasks.update(task.id, now);
  }

  private async listTasks(params: unknown, agent: AgentDefinition, caller: Caller) {
    const { contextId, status, pageSize, pageToken } = (params ?? {}) as Record<string, unknown>;
    if (contextId !== undefined && typeof contextId !== 'string') throw new A2ARpcError(A2A_ERRORS.invalidParams, 'contextId must be a string');
    const state = status === undefined ? undefined : WIRE_TO_STATE[String(status)];
    if (status !== undefined && !state) throw new A2ARpcError(A2A_ERRORS.invalidParams, `status ${String(status)} is not a task state`);
    const size = pageSize === undefined ? 50 : Number(pageSize);
    if (!Number.isInteger(size) || size < 1 || size > 100) throw new A2ARpcError(A2A_ERRORS.invalidParams, 'pageSize must be 1 to 100');
    const offset = pageToken === undefined || pageToken === '' ? 0 : Number(pageToken);
    if (!Number.isInteger(offset) || offset < 0) throw new A2ARpcError(A2A_ERRORS.invalidParams, 'pageToken is not one we issued');

    const page = await this.tasks.listForCaller(
      caller.id,
      agent.slug,
      { ...(contextId === undefined ? {} : { contextId: contextId as string }), ...(state === undefined ? {} : { state }) },
      { offset, size },
    );
    const tasks = [];
    for (const task of page.tasks) tasks.push(wireTask(await this.refreshed(task)));
    return {
      tasks,
      nextPageToken: offset + size < page.total ? String(offset + size) : '',
      pageSize: size,
      totalSize: page.total,
    };
  }

  private async cancel(task: TaskRow): Promise<TaskRow> {
    const current = await this.refreshed(task);
    if (isTerminal(current.state) || !current.runId) {
      throw new A2ARpcError(A2A_ERRORS.taskNotCancelable, `Task ${task.id} is ${current.state} and cannot be canceled`);
    }
    const run = await this.runs.requestCancel(current.orgSlug, current.runId);
    return this.tasks.update(current.id, runTaskState(run, current.orgSlug));
  }
}
