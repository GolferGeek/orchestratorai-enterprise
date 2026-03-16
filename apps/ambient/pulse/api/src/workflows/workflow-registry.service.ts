import { Injectable, Logger } from '@nestjs/common';

export type WorkflowStatus = 'idle' | 'running' | 'completed' | 'failed';
export type TriggerType = 'db-change' | 'file-change' | 'internal-a2a' | 'scheduled' | 'manual';

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  trigger: TriggerType;
  triggerFilter?: Record<string, unknown>;
  steps: WorkflowStep[];
  enabled: boolean;
}

export interface WorkflowStep {
  id: string;
  name: string;
  action: string;
  params?: Record<string, unknown>;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: WorkflowStatus;
  triggeredBy: TriggerType;
  startedAt: string;
  completedAt: string | null;
  outcome: Record<string, unknown> | null;
  error: string | null;
}

/**
 * Registry for workflow definitions and their execution history.
 * Workflows are triggered by internal events from the listeners layer.
 */
@Injectable()
export class WorkflowRegistryService {
  private readonly logger = new Logger(WorkflowRegistryService.name);
  private readonly workflows = new Map<string, WorkflowDefinition>();
  private readonly runs: WorkflowRun[] = [];

  register(definition: WorkflowDefinition): void {
    this.workflows.set(definition.id, definition);
    this.logger.log(`Registered workflow: ${definition.name} (trigger: ${definition.trigger})`);
  }

  getAll(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  getById(id: string): WorkflowDefinition | undefined {
    return this.workflows.get(id);
  }

  enable(id: string): void {
    const wf = this.workflows.get(id);
    if (wf) {
      wf.enabled = true;
    }
  }

  disable(id: string): void {
    const wf = this.workflows.get(id);
    if (wf) {
      wf.enabled = false;
    }
  }

  recordRun(run: WorkflowRun): void {
    this.runs.push(run);
    // Keep last 200 runs in memory
    if (this.runs.length > 200) {
      this.runs.shift();
    }
  }

  getRuns(workflowId?: string): WorkflowRun[] {
    if (workflowId) {
      return this.runs.filter((r) => r.workflowId === workflowId);
    }
    return [...this.runs].reverse();
  }
}
