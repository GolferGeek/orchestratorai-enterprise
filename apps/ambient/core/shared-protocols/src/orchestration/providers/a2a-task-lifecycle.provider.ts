import * as crypto from 'crypto';
import { Workflow, WorkflowStep } from '@agent-communication/shared-types';
import { IOrchestrationProvider } from '../orchestration.interface';

type A2ATaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'canceled';

interface TaskEvent {
  taskId: string;
  state: A2ATaskState;
  timestamp: string;
  detail?: Record<string, unknown>;
}

interface TaskRecord {
  taskId: string;
  state: A2ATaskState;
  conversation: string[];
  events: TaskEvent[];
}

export class A2ATaskLifecycleOrchestrationProvider implements IOrchestrationProvider {
  readonly providerId = 'a2a-task-lifecycle';

  private workflows: Map<string, Workflow> = new Map();
  private pendingCallbacks: Map<string, (result: unknown) => void> = new Map();
  private tasks: Map<string, TaskRecord> = new Map();

  async createWorkflow(steps: Omit<WorkflowStep, 'status'>[]): Promise<Workflow> {
    const taskId = crypto.randomUUID();
    const workflow: Workflow = {
      id: taskId,
      name: `a2a-task-${Date.now()}`,
      steps: steps.map((step) => ({ ...step, status: 'pending' })),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.workflows.set(workflow.id, workflow);
    this.tasks.set(taskId, {
      taskId,
      state: 'submitted',
      conversation: [],
      events: [{ taskId, state: 'submitted', timestamp: new Date().toISOString() }],
    });
    return workflow;
  }

  async delegate(agentId: string, task: string, params?: Record<string, unknown>): Promise<string> {
    const taskId = crypto.randomUUID();
    this.tasks.set(taskId, {
      taskId,
      state: 'working',
      conversation: [`Delegated to ${agentId}: ${task}`],
      events: [
        { taskId, state: 'submitted', timestamp: new Date().toISOString(), detail: params },
        { taskId, state: 'working', timestamp: new Date().toISOString(), detail: { agentId } },
      ],
    });
    return taskId;
  }

  async awaitResult(taskId: string): Promise<unknown> {
    return new Promise<unknown>((resolve) => {
      this.pendingCallbacks.set(taskId, resolve);
    });
  }

  async handleCallback(taskId: string, result: unknown): Promise<void> {
    const callback = this.pendingCallbacks.get(taskId);
    if (callback) {
      callback(result);
      this.pendingCallbacks.delete(taskId);
    }

    const task = this.tasks.get(taskId);
    if (task) {
      this.transitionTask(taskId, 'completed', { result });
    }
  }

  transitionTask(taskId: string, state: A2ATaskState, detail?: Record<string, unknown>): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Unknown A2A task: ${taskId}`);
    }
    task.state = state;
    task.events.push({
      taskId,
      state,
      timestamp: new Date().toISOString(),
      detail,
    });
  }

  appendConversation(taskId: string, message: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Unknown A2A task: ${taskId}`);
    }
    task.conversation.push(message);
  }

  getTaskState(taskId: string): A2ATaskState | null {
    const task = this.tasks.get(taskId);
    return task ? task.state : null;
  }

  listTaskEvents(taskId: string): TaskEvent[] {
    const task = this.tasks.get(taskId);
    if (!task) {
      return [];
    }
    return [...task.events];
  }
}
