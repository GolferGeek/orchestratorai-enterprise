import * as crypto from 'crypto';
import { Workflow, WorkflowStep } from '@agent-communication/shared-types';
import { IOrchestrationProvider } from '../orchestration.interface';

export class PipelineOrchestrationProvider implements IOrchestrationProvider {
  readonly providerId = 'pipeline';

  private workflows: Map<string, Workflow> = new Map();
  private pendingCallbacks: Map<string, (result: unknown) => void> = new Map();

  async createWorkflow(steps: Omit<WorkflowStep, 'status'>[]): Promise<Workflow> {
    const workflow: Workflow = {
      id: crypto.randomUUID(),
      name: `pipeline-${Date.now()}`,
      steps: steps.map(s => ({ ...s, status: 'pending' as const })),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  async delegate(agentId: string, task: string, params?: Record<string, unknown>): Promise<string> {
    const taskId = crypto.randomUUID();
    // In pipeline mode, delegation is sequential — store for later resolution
    console.log(`[Pipeline] Delegating task ${taskId} to ${agentId}: ${task}`, params);
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
  }

  getWorkflow(workflowId: string): Workflow | undefined {
    return this.workflows.get(workflowId);
  }
}
