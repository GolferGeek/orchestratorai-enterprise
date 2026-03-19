import * as crypto from 'crypto';
import { Workflow, WorkflowStep } from '@agent-communication/shared-types';
import { IOrchestrationProvider } from '../orchestration.interface';

type CheckoutWorkflowState = 'cart-created' | 'cart-updated' | 'payment-pending' | 'completed' | 'canceled';

interface CheckoutTaskState {
  taskId: string;
  agentId: string;
  task: string;
  state: CheckoutWorkflowState;
  updatedAt: string;
}

const VALID_TRANSITIONS: Record<CheckoutWorkflowState, CheckoutWorkflowState[]> = {
  'cart-created': ['cart-updated', 'payment-pending', 'canceled'],
  'cart-updated': ['payment-pending', 'canceled'],
  'payment-pending': ['completed', 'canceled'],
  completed: [],
  canceled: [],
};

export class CommerceCheckoutFsmOrchestrationProvider implements IOrchestrationProvider {
  readonly providerId = 'commerce-checkout-fsm';

  private workflows = new Map<string, Workflow>();
  private pendingCallbacks = new Map<string, (result: unknown) => void>();
  private checkoutTasks = new Map<string, CheckoutTaskState>();

  async createWorkflow(steps: Omit<WorkflowStep, 'status'>[]): Promise<Workflow> {
    const workflow: Workflow = {
      id: crypto.randomUUID(),
      name: `commerce-checkout-${Date.now()}`,
      steps: steps.map((step) => ({ ...step, status: 'pending' as const })),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  async delegate(agentId: string, task: string, params?: Record<string, unknown>): Promise<string> {
    const taskId = crypto.randomUUID();
    this.checkoutTasks.set(taskId, {
      taskId,
      agentId,
      task,
      state: 'cart-created',
      updatedAt: new Date().toISOString(),
    });
    void params;
    return taskId;
  }

  async awaitResult(taskId: string): Promise<unknown> {
    return new Promise<unknown>((resolve) => {
      this.pendingCallbacks.set(taskId, resolve);
    });
  }

  async handleCallback(taskId: string, result: unknown): Promise<void> {
    const state = this.checkoutTasks.get(taskId);
    if (state && typeof result === 'object' && result !== null && 'state' in result) {
      const nextState = (result as { state: CheckoutWorkflowState }).state;
      this.transitionCheckout(taskId, nextState);
    }
    const callback = this.pendingCallbacks.get(taskId);
    if (callback) {
      callback(result);
      this.pendingCallbacks.delete(taskId);
    }
  }

  transitionCheckout(taskId: string, nextState: CheckoutWorkflowState): void {
    const taskState = this.checkoutTasks.get(taskId);
    if (!taskState) {
      throw new Error(`Checkout task ${taskId} not found`);
    }
    const allowedTransitions = VALID_TRANSITIONS[taskState.state];
    if (!allowedTransitions.includes(nextState)) {
      throw new Error(`Invalid checkout transition ${taskState.state} -> ${nextState}`);
    }
    taskState.state = nextState;
    taskState.updatedAt = new Date().toISOString();
  }

  getCheckoutTaskState(taskId: string): CheckoutTaskState | undefined {
    return this.checkoutTasks.get(taskId);
  }
}
