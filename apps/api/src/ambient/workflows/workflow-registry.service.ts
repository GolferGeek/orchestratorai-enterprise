import { Injectable, Logger } from '@nestjs/common';

export type WorkflowStatus = 'idle' | 'running' | 'completed' | 'failed';
export type TriggerType = 'db-change' | 'file-change' | 'internal-a2a' | 'scheduled' | 'manual';

export interface WorkflowDefinition {
  id: string;
  orgSlug: string;
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
  orgSlug: string;
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
    this.workflows.set(this.workflowKey(definition.orgSlug, definition.id), {
      ...definition,
    });
    this.logger.log(`Registered workflow: ${definition.name} (trigger: ${definition.trigger})`);
  }

  getAll(orgSlug?: string): WorkflowDefinition[] {
    const workflows = Array.from(this.workflows.values());
    return orgSlug && orgSlug !== '*'
      ? workflows.filter((workflow) => workflow.orgSlug === orgSlug)
      : workflows;
  }

  getById(id: string, orgSlug?: string): WorkflowDefinition | undefined {
    if (orgSlug && orgSlug !== '*') {
      return this.workflows.get(this.workflowKey(orgSlug, id));
    }
    return Array.from(this.workflows.values()).find(
      (workflow) => workflow.id === id,
    );
  }

  enable(id: string, orgSlug?: string): void {
    const wf = this.getById(id, orgSlug);
    if (wf) {
      wf.enabled = true;
    }
  }

  disable(id: string, orgSlug?: string): void {
    const wf = this.getById(id, orgSlug);
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

  getRuns(workflowId?: string, orgSlug?: string): WorkflowRun[] {
    const scopedRuns =
      orgSlug && orgSlug !== '*'
        ? this.runs.filter((run) => run.orgSlug === orgSlug)
        : this.runs;
    if (workflowId) {
      return scopedRuns.filter((r) => r.workflowId === workflowId);
    }
    return [...scopedRuns].reverse();
  }

  private workflowKey(orgSlug: string, workflowId: string): string {
    return `${orgSlug}:${workflowId}`;
  }
}
