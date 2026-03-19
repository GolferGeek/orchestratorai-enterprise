import { Workflow, WorkflowStep } from '@agent-communication/shared-types';

export interface IOrchestrationProvider {
  readonly providerId: string;

  createWorkflow(steps: Omit<WorkflowStep, 'status'>[]): Promise<Workflow>;
  delegate(agentId: string, task: string, params?: Record<string, unknown>): Promise<string>;
  awaitResult(taskId: string): Promise<unknown>;
  handleCallback(taskId: string, result: unknown): Promise<void>;
}
