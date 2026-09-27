import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionContext, JsonValue, WorkflowDocumentRef, WorkflowRunRestart } from '@orchestrator-ai/transport-types';
import { ConversationOwnershipService } from '../../common/conversations/conversation-ownership.service';
import { WorkflowCatalogService } from '../catalog/workflow-catalog.service';
import { WorkflowInputError, WorkflowRegistry, type WorkflowEntryPoint } from '../catalog/workflow.registry';
import { WorkflowDocumentError, WorkflowDocumentsService } from '../shared/documents/workflow-documents.service';
import { MissingModelProfileError, ModelProfilesRepository, ModelUnavailableError } from '../shared/models';
import { WorkflowRunsRepository, type WorkflowRunAccessControl, type WorkflowRunRecord } from '../shared/runs';
import { ObservabilityService } from '../shared/services/observability.service';

export type RuntimeEntryPoint = Extract<WorkflowEntryPoint, { kind: 'runtime' }>;

/** Why a run was not queued: the caller's input (`invalid`) or the org's setup (`refused`). */
export type LaunchRefusal = { ok: false; kind: 'invalid' | 'refused'; message: string };
export type Launched<T> = { ok: true; value: T } | LaunchRefusal;

const refuse = (kind: LaunchRefusal['kind'], message: string): LaunchRefusal => ({ ok: false, kind, message });

export interface LaunchRequest {
  /** Its conversationId becomes the run id; the conversation row is created for it. */
  context: ExecutionContext;
  input: JsonValue;
  documents?: WorkflowDocumentRef[];
  /** A restart: input is the parent's, already parsed. */
  restart?: WorkflowRunRestart;
  /** Overrides the workflow's rule (system runs are the org's, not the NIL user's). */
  accessControl?: WorkflowRunAccessControl;
  queuedMessage: string;
}

/**
 * Queues a runtime workflow run: the one path for a person's `start` or
 * `restart` (POST /workflows/invoke) and an ambient trigger's launch. It checks
 * the workflow is available and enabled for the org, validates the input and
 * uploads, snapshots the org's models, creates the conversation, and queues
 * the run for the worker.
 */
@Injectable()
export class WorkflowRunLauncher {
  private readonly logger = new Logger(WorkflowRunLauncher.name);

  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly catalog: WorkflowCatalogService,
    private readonly conversations: ConversationOwnershipService,
    private readonly runs: WorkflowRunsRepository,
    private readonly documents: WorkflowDocumentsService,
    private readonly modelProfiles: ModelProfilesRepository,
    private readonly observability: ObservabilityService,
  ) {}

  /** The runtime entry point of a workflow the org may use, or why not. */
  async runtimeEntry(slug: string, orgSlug: string): Promise<Launched<RuntimeEntryPoint>> {
    const workflow = this.registry.get(slug, orgSlug);
    if (!workflow) return refuse('invalid', `Workflow "${slug}" is not available to organization "${orgSlug}"`);
    if (!(await this.catalog.isEnabled(orgSlug, workflow))) {
      return refuse('refused', `Workflow "${slug}" is disabled for organization "${orgSlug}"`);
    }
    if (workflow.entryPoint.kind !== 'runtime') {
      return refuse('invalid', `Workflow "${slug}" does not run on the workflow runtime`);
    }
    return { ok: true, value: workflow.entryPoint };
  }

  async launch(entryPoint: RuntimeEntryPoint, request: LaunchRequest): Promise<Launched<WorkflowRunRecord>> {
    const { context } = request;
    if (await this.runs.getForOrg(context.orgSlug, context.conversationId)) {
      return refuse(
        'invalid',
        request.restart
          ? 'A restart is a new run: send it with a new conversation'
          : 'A run already exists for this conversation; start a new conversation',
      );
    }
    let input: JsonValue;
    try {
      input = request.restart ? request.input : entryPoint.parseStartInput(request.input);
    } catch (error) {
      if (error instanceof WorkflowInputError) return refuse('invalid', error.message);
      throw error;
    }
    const documents = request.documents ?? [];
    if (!request.restart) {
      try {
        await this.documents.verify(context, documents);
      } catch (error) {
        if (error instanceof WorkflowDocumentError) return refuse('invalid', error.message);
        throw error;
      }
    }
    let modelProfile;
    try {
      modelProfile = await this.modelProfiles.snapshot(context.orgSlug, context.agentSlug, entryPoint.modelRoles);
    } catch (error) {
      if (error instanceof MissingModelProfileError || error instanceof ModelUnavailableError) {
        return refuse('refused', error.message);
      }
      throw error;
    }
    try {
      await this.conversations.ensure(context);
    } catch (error) {
      // Why (another owner, another agent) is not the caller's to learn.
      this.logger.error(`Conversation check failed for ${context.conversationId}: ${(error as Error).message}`);
      return refuse('invalid', 'params.context.conversationId cannot be used for this invocation');
    }
    const run = await this.runs.insertQueued({
      context,
      input,
      documents,
      modelProfile,
      accessControl: request.accessControl ?? entryPoint.accessControl,
      maxAttempts: entryPoint.maxAttempts,
      ...(request.restart ? { restart: request.restart } : {}),
    });
    await this.observability.emitQueued(context, run.id, request.queuedMessage);
    return { ok: true, value: run };
  }
}
