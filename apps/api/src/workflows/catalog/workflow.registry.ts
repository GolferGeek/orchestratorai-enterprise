import { Injectable, Logger } from '@nestjs/common';
import type {
  A2AInvokeErrorResponse,
  A2AInvokeSuccessResponse,
  JsonValue,
  WorkflowRunSummary,
} from '@orchestrator-ai/transport-types';
import type {
  WorkflowRunAccessControl,
  WorkflowRunReader,
} from '../shared/runs/workflow-run.types';

/**
 * Where a custom workflow's run history lives, behind the catalog's generic
 * run endpoints. Runtime workflows need none: their runs are workflows.runs.
 */
export interface WorkflowRunSource {
  list(reader: WorkflowRunReader): Promise<WorkflowRunSummary[]>;
  /** False when the reader owns no such run. */
  delete(conversationId: string, reader: WorkflowRunReader): Promise<boolean>;
}

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
 * How `POST /workflows/invoke` reaches a workflow.
 *
 * - `runtime`: runs on the shared run runtime. `start` queues a run; the
 *   worker executes it through the handler registered for the slug.
 * - `custom`: a workflow with its own invoke contract (marketing-swarm). It
 *   receives the already-authorized request and answers it itself.
 * - `rest`: not invocable through A2A yet; callers use its REST endpoint.
 */
export type WorkflowEntryPoint =
  | {
      kind: 'runtime';
      /** Attempts a run gets before a transient failure fails it. */
      maxAttempts: number;
      accessControl: WorkflowRunAccessControl;
      /** Validate and normalize `start` input; throw WorkflowInputError. */
      parseStartInput(input: JsonValue): JsonValue;
      /** The run's label in the run list, from its parsed input. */
      runTitle(input: JsonValue): string;
    }
  | {
      kind: 'custom';
      invoke(
        body: unknown,
        userId: string,
        organizationSlug: string | undefined,
      ): Promise<A2AInvokeSuccessResponse | A2AInvokeErrorResponse>;
      /** Its run history, or null when it keeps none. */
      runs: WorkflowRunSource | null;
    }
  | { kind: 'rest'; endpoint: string };

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

  has(slug: string, orgSlug?: string): boolean {
    return this.get(slug, orgSlug) !== undefined;
  }
}
