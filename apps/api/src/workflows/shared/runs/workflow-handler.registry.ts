import { Injectable } from '@nestjs/common';
import type { JsonValue } from '@orchestrator-ai/transport-types';
import type { WorkflowRunRecord } from './workflow-run.types';
import type { WorkflowRunProgress } from './workflow-runs.repository';

/** What the worker gives a handler for one run. */
export interface WorkflowRunExecution {
  run: WorkflowRunRecord;
  /** Aborted when the run's cancel is requested or its lease is lost. */
  signal: AbortSignal;
  reportProgress(progress: WorkflowRunProgress): Promise<void>;
}

export type WorkflowHandlerOutcome = { kind: 'completed'; result: JsonValue };

export interface WorkflowRunHandler {
  slug: string;
  run(execution: WorkflowRunExecution): Promise<WorkflowHandlerOutcome>;
}

/**
 * Thrown by a handler for a failure worth retrying (a provider timeout, a
 * dropped connection). Anything else fails the run on the first attempt.
 */
export class WorkflowTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowTransientError';
  }
}

/**
 * Which code runs which workflow. Replaces local's if/else dispatch chain:
 * each workflow registers its handler at module init, and an unregistered
 * slug is an error, never a default workflow.
 */
@Injectable()
export class WorkflowHandlerRegistry {
  private readonly handlers = new Map<string, WorkflowRunHandler>();

  register(handler: WorkflowRunHandler): void {
    if (this.handlers.has(handler.slug)) {
      throw new Error(`A run handler for "${handler.slug}" is already registered`);
    }
    this.handlers.set(handler.slug, handler);
  }

  get(slug: string): WorkflowRunHandler {
    const handler = this.handlers.get(slug);
    if (!handler) throw new Error(`No run handler is registered for workflow "${slug}"`);
    return handler;
  }

  has(slug: string): boolean {
    return this.handlers.has(slug);
  }
}
