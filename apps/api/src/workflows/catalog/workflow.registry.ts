import { Injectable, Logger } from '@nestjs/common';
import type {
  DataClassification,
  JsonValue,
  WorkflowLifecycle,
} from '@orchestrator-ai/transport-types';
import type { WorkflowRunAccessControl, WorkflowRunRecord } from '../shared/runs/workflow-run.types';

/**
 * Thrown by a runtime workflow's input parser. Its message is shown to the
 * caller, so it must describe the input problem and nothing internal.
 */
export class WorkflowInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowInputError';
  }
}

/**
 * How `POST /workflows/invoke` reaches a workflow: every workflow runs on the
 * shared run runtime. `start` queues a run; the worker executes it through
 * the handler registered for the slug.
 */
export interface WorkflowEntryPoint {
  kind: 'runtime';
  /** Attempts a run gets before a transient failure fails it. */
  maxAttempts: number;
  /**
   * The model roles its steps call (callForRole). Each needs a profile
   * in the org before a run can start; the run snapshots them.
   */
  modelRoles: string[];
  accessControl: WorkflowRunAccessControl;
  /** Validate and normalize `start` input; throw WorkflowInputError. */
  parseStartInput(input: JsonValue): JsonValue;
  /** The run's label in the run list, from its parsed input. */
  runTitle(input: JsonValue): string;
  /**
   * Where a new run may branch from a finished one: after the work unit
   * with this slug completed, resuming at the graph node `resumeAt`. A
   * restart "before" a unit is a restart after the unit before it. `{}`
   * when the workflow cannot restart.
   */
  restartPoints: Record<string, { resumeAt: string }>;
  /**
   * One run per business key (an order, say) instead of one per start. An
   * ambient trigger's events go to `route`; the key is the run id (and so the
   * conversation and the LangGraph thread), so it must be a UUID. Absent:
   * every trigger fire starts a new run.
   */
  keyedRuns?: KeyedRuns;
}

/** What a keyed workflow sees of an ambient event. */
export interface KeyedRunEvent {
  sourceType: 'database' | 'filesystem' | 'cron' | 'event';
  payload: Record<string, unknown>;
}

/**
 * What an event means for a keyed workflow: start the key's run with this
 * input (or, when it already exists, hand the event to it), hand it to the
 * key's run only, or nothing (with the reason, recorded on the execution).
 */
export type KeyedRunRoute =
  | { kind: 'start'; key: string; input: JsonValue }
  | { kind: 'deliver'; key: string }
  | { kind: 'ignore'; reason: string };

export interface KeyedRuns {
  /** Pure: decide from the event alone. Throw on an event it cannot read. */
  route(event: KeyedRunEvent): KeyedRunRoute;
  /**
   * An event for the key's run, which exists: do what it means for that run
   * (nothing, or answer the review it waits on, ...) and say what that was.
   */
  deliver(run: WorkflowRunRecord, event: KeyedRunEvent): Promise<string>;
  /**
   * A catch-up sweep, run when a cron trigger fires for this workflow: every
   * key whose run should exist and may not (an order left at a start status,
   * say), with the input its own event would have given. Keys that already
   * have a run are skipped. Absent: a cron trigger on this workflow is an error.
   */
  sweep?(): Promise<KeyedRunStart[]>;
}

/** A key's run to start, as a sweep finds it. */
export type KeyedRunStart = Extract<KeyedRunRoute, { kind: 'start' }>;

/**
 * A LangGraph workflow, as the catalog sees it.
 *
 * `organizationSlugs` follows the same convention as agents: `global` means
 * every org, otherwise the workflow is scoped to the orgs listed.
 */
export interface CatalogWorkflow {
  slug: string;
  name: string;
  description?: string;
  organizationSlugs: string[];
  entryPoint: WorkflowEntryPoint;
  /** Icon name the web kit maps to an icon. */
  icon: string;
  /** Nav group when the org has not put it in one of its own. */
  defaultGroup: string;
  /** Lifecycle badge when the org has not set one. */
  defaultLifecycle: WorkflowLifecycle;
  /** Whether it stops for people (human gates). */
  hitl: boolean;
  /** Sensitivity of what it handles, passed to the LLM plane as policy. */
  dataClassification: DataClassification;
}

/**
 * The catalog of LangGraph workflows, populated from code.
 *
 * WHY THIS EXISTS. Workflows used to be listed by querying the **agents**
 * table, filtered by a hardcoded slug set in `AgentDefinitionService`. That
 * meant a workflow needed a row in `agents` describing an agent that no family
 * runner could execute, plus its slug written into a constant, plus an entry in
 * a second hardcoded check in the controller. Three special cases to add one
 * workflow.
 *
 * That arrangement was sediment: those rows predate the workflow concept, from
 * when everything was an agent. Agents and workflows are different things and
 * should share no storage:
 *
 *   an agent    = a row, fully defined by that row, run by a family runner
 *   a workflow  = a LangGraph endpoint in code, and nothing else
 *
 * So a workflow registers itself here at module init. Adding one is writing the
 * graph and calling `register`. No row, no constant, no controller edit.
 */
@Injectable()
export class WorkflowRegistry {
  private readonly logger = new Logger(WorkflowRegistry.name);
  private readonly workflows = new Map<string, CatalogWorkflow>();

  register(workflow: CatalogWorkflow): void {
    if (this.workflows.has(workflow.slug)) {
      // Two graphs claiming one slug is a wiring mistake, and the catalog
      // would silently show whichever registered last.
      throw new Error(
        `Workflow '${workflow.slug}' is already registered. Slugs must be unique.`,
      );
    }
    this.workflows.set(workflow.slug, { ...workflow });
    this.logger.log(
      `Registered workflow: ${workflow.slug} (${workflow.organizationSlugs.join(', ')})`,
    );
  }

  /**
   * Workflows visible to an org. `*` or absent returns everything, matching
   * how agent listing treats the all-organizations scope.
   */
  list(orgSlug?: string): CatalogWorkflow[] {
    const all = Array.from(this.workflows.values());
    if (!orgSlug || orgSlug === '*') {
      return all;
    }
    return all.filter(
      (workflow) =>
        workflow.organizationSlugs.includes(orgSlug) ||
        workflow.organizationSlugs.includes('global'),
    );
  }

  get(slug: string, orgSlug?: string): CatalogWorkflow | undefined {
    return this.list(orgSlug).find((workflow) => workflow.slug === slug);
  }

  /** Every registered workflow, regardless of org (registry sync). */
  all(): CatalogWorkflow[] {
    return Array.from(this.workflows.values());
  }

  has(slug: string, orgSlug?: string): boolean {
    return this.get(slug, orgSlug) !== undefined;
  }
}
