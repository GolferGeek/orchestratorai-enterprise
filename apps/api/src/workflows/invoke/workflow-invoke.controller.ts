import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  isWorkflowInvokeAction,
  type ExecutionContext,
  JsonRpcErrorCode,
  type A2AInvokeErrorResponse,
  type A2AInvokeRequest,
  type A2AInvokeSuccessResponse,
  type WorkflowInvokeResult,
} from '@orchestrator-ai/transport-types';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { validateA2AInvokeRequest } from '../../common/validation/a2a-invoke-validation';
import { ConversationOwnershipService } from '../../common/conversations/conversation-ownership.service';
import {
  WorkflowInputError,
  WorkflowRegistry,
  type WorkflowEntryPoint,
} from '../catalog/workflow.registry';
import { WorkflowCatalogService } from '../catalog/workflow-catalog.service';
import {
  WorkflowRunsRepository,
  WorkflowRunTransitionError,
} from '../shared/runs';
import {
  WorkflowDocumentError,
  WorkflowDocumentsService,
} from '../shared/documents/workflow-documents.service';
import {
  HumanReviewError,
  HumanReviewService,
  parseReviewResponse,
} from '../shared/reviews';
import {
  MissingModelProfileError,
  ModelProfilesRepository,
  ModelUnavailableError,
  type RunModelProfile,
} from '../shared/models';
import { ObservabilityService } from '../shared/services/observability.service';
import { restartEligibility } from '../shared/restarts/restart-eligibility';
import { WorkUnitTraceReader } from '../shared/work-units/work-unit-trace.reader';

/** A restart instruction is a note to the agents, not a document. */
const MAX_RESTART_INSTRUCTION = 4000;

interface AuthorizedRequest {
  organizationSlug?: string;
}

type InvokeResponse = A2AInvokeSuccessResponse | A2AInvokeErrorResponse;
type RequestId = string | number | null;
type RuntimeEntryPoint = Extract<WorkflowEntryPoint, { kind: 'runtime' }>;

function failure(id: RequestId, code: JsonRpcErrorCode, message: string): A2AInvokeErrorResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

/**
 * The single A2A entry point for every workflow: `POST /workflows/invoke`.
 *
 * It authorizes the request (user and org must match the token and RBAC),
 * resolves the workflow from the registry for that org, guarantees the
 * conversation row, then dispatches on the workflow's entry point:
 *
 * - `runtime`: `data.content` is a WorkflowInvokeAction. `start` queues a run
 *   and answers `{ runId, status }` at once; the worker executes it.
 *   `review.submit`, `answer.submit` and `finish` answer the run's open
 *   human gate and requeue it; `cancel` also expires an open gate.
 *   `restart` queues a new run (the context's new conversation) that
 *   branches from a finished run after one of its work units.
 * - `custom`: the workflow answers the request itself (marketing-swarm).
 * - `rest`: not invocable here yet.
 */
@Controller('workflows')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class WorkflowInvokeController {
  private readonly logger = new Logger(WorkflowInvokeController.name);

  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly catalog: WorkflowCatalogService,
    private readonly conversations: ConversationOwnershipService,
    private readonly runs: WorkflowRunsRepository,
    private readonly documents: WorkflowDocumentsService,
    private readonly reviews: HumanReviewService,
    private readonly modelProfiles: ModelProfilesRepository,
    private readonly observability: ObservabilityService,
    private readonly trace: WorkUnitTraceReader,
  ) {}

  @Post('invoke')
  @HttpCode(HttpStatus.OK)
  async invoke(
    @Body() body: unknown,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ): Promise<InvokeResponse> {
    const validation = validateA2AInvokeRequest(body, user.id, request.organizationSlug);
    if (!validation.valid) {
      return failure(validation.id, JsonRpcErrorCode.INVALID_PARAMS, validation.message);
    }
    const invoke = validation.request;
    const { id } = invoke;
    const { context } = invoke.params;

    if (context.agentType !== 'workflow') {
      return failure(id, JsonRpcErrorCode.INVALID_PARAMS, 'params.context.agentType must be "workflow"');
    }
    const workflow = this.registry.get(context.agentSlug, context.orgSlug);
    if (!workflow) {
      return failure(
        id,
        JsonRpcErrorCode.INVALID_PARAMS,
        `Workflow "${context.agentSlug}" is not available to organization "${context.orgSlug}"`,
      );
    }
    if (!(await this.catalog.isEnabled(context.orgSlug, workflow))) {
      return failure(
        id,
        JsonRpcErrorCode.INVALID_REQUEST,
        `Workflow "${workflow.slug}" is disabled for organization "${context.orgSlug}"`,
      );
    }
    const entryPoint = workflow.entryPoint;
    if (entryPoint.kind === 'rest') {
      return failure(
        id,
        JsonRpcErrorCode.METHOD_NOT_FOUND,
        `Workflow "${workflow.slug}" is not invocable through A2A yet; use ${entryPoint.endpoint}`,
      );
    }

    try {
      await this.conversations.ensure(context);
    } catch (error) {
      this.logger.error(
        `Conversation check failed for ${context.conversationId}: ${(error as Error).message}`,
      );
      return failure(
        id,
        JsonRpcErrorCode.INVALID_PARAMS,
        'params.context.conversationId cannot be used for this invocation',
      );
    }

    if (entryPoint.kind === 'custom') {
      return entryPoint.invoke(body, user.id, request.organizationSlug);
    }

    try {
      return await this.dispatchRuntime(invoke, entryPoint, request.organizationSlug);
    } catch (error) {
      this.logger.error(
        `Workflow ${workflow.slug} invocation failed: ${(error as Error).message}`,
      );
      return failure(id, JsonRpcErrorCode.INTERNAL_ERROR, 'Workflow invocation failed');
    }
  }

  private async dispatchRuntime(
    invoke: A2AInvokeRequest,
    entryPoint: RuntimeEntryPoint,
    authorizedOrganizationSlug: string | undefined,
  ): Promise<InvokeResponse> {
    const { id } = invoke;
    const { context, data } = invoke.params;

    if (data.contentType !== 'json' || !isWorkflowInvokeAction(data.content)) {
      return failure(
        id,
        JsonRpcErrorCode.INVALID_PARAMS,
        'params.data must be a workflow action with contentType "json"',
      );
    }
    // A super-admin without a selected organization is bound to "*". Runs
    // belong to one org, so a write needs that org chosen explicitly.
    if (!authorizedOrganizationSlug || authorizedOrganizationSlug === '*') {
      return failure(
        id,
        JsonRpcErrorCode.INVALID_REQUEST,
        'Select an organization before invoking a workflow',
      );
    }

    const action = data.content;
    switch (action.action) {
      case 'start': {
        if (await this.runs.getForOrg(context.orgSlug, context.conversationId)) {
          return failure(
            id,
            JsonRpcErrorCode.INVALID_REQUEST,
            'A run already exists for this conversation; start a new conversation',
          );
        }
        let input;
        try {
          input = entryPoint.parseStartInput(action.input);
        } catch (error) {
          if (error instanceof WorkflowInputError) {
            return failure(id, JsonRpcErrorCode.INVALID_PARAMS, error.message);
          }
          throw error;
        }
        const documents = action.documents ?? [];
        try {
          await this.documents.verify(context, documents);
        } catch (error) {
          if (error instanceof WorkflowDocumentError) {
            return failure(id, JsonRpcErrorCode.INVALID_PARAMS, error.message);
          }
          throw error;
        }
        const modelProfile = await this.snapshotModels(context, entryPoint);
        if ('error' in modelProfile) return failure(id, JsonRpcErrorCode.INVALID_REQUEST, modelProfile.error);
        const run = await this.runs.insertQueued({
          context,
          input,
          documents,
          modelProfile: modelProfile.profile,
          accessControl: entryPoint.accessControl,
          maxAttempts: entryPoint.maxAttempts,
        });
        await this.observability.emitQueued(
          context,
          run.id,
          `Run queued${documents.length > 0 ? ` with ${documents.length} document(s)` : ''}`,
        );
        return this.success(invoke, { runId: run.id, status: run.status });
      }
      case 'cancel': {
        if (action.runId !== context.conversationId) {
          return failure(
            id,
            JsonRpcErrorCode.INVALID_PARAMS,
            'cancel.runId must be the conversation the context names',
          );
        }
        let canceled;
        try {
          canceled = await this.runs.requestCancel(context.orgSlug, action.runId);
        } catch (error) {
          if (error instanceof WorkflowRunTransitionError) {
            return failure(id, JsonRpcErrorCode.INVALID_REQUEST, 'The run is not queued, running or waiting');
          }
          throw error;
        }
        if (canceled.status === 'canceled') {
          await this.reviews.closeForEndedRun(canceled.id);
          await this.observability.emitCanceled(context, canceled.id);
        }
        return this.success(invoke, { runId: canceled.id, status: canceled.status });
      }
      case 'review.submit':
      case 'answer.submit':
      case 'finish': {
        const parsed = parseReviewResponse(action);
        if ('error' in parsed) {
          return failure(id, JsonRpcErrorCode.INVALID_PARAMS, parsed.error);
        }
        try {
          await this.reviews.respond(context, action.reviewId, parsed.response);
        } catch (error) {
          if (error instanceof HumanReviewError) {
            return failure(
              id,
              error.code === 'conflict'
                ? JsonRpcErrorCode.INVALID_REQUEST
                : JsonRpcErrorCode.INVALID_PARAMS,
              error.message,
            );
          }
          throw error;
        }
        return this.success(invoke, { runId: context.conversationId, status: 'queued' });
      }
      case 'restart': {
        if (await this.runs.getForOrg(context.orgSlug, context.conversationId)) {
          return failure(
            id,
            JsonRpcErrorCode.INVALID_REQUEST,
            'A restart is a new run: send it with a new conversation',
          );
        }
        const parent = await this.runs.getReadable(action.source.runId, {
          userId: context.userId,
          organizationSlug: context.orgSlug,
        });
        if (!parent || parent.workflowSlug !== context.agentSlug) {
          return failure(id, JsonRpcErrorCode.INVALID_PARAMS, `No run ${action.source.runId} of this workflow to restart`);
        }
        const unit = (await this.trace.units(parent.id)).find((u) => u.workUnitId === action.source.workUnitRunId);
        if (!unit) {
          return failure(id, JsonRpcErrorCode.INVALID_PARAMS, `Run ${parent.id} has no step ${action.source.workUnitRunId}`);
        }
        const eligibility = restartEligibility(parent, unit, entryPoint.restartPoints);
        if (!eligibility.eligible) {
          return failure(id, JsonRpcErrorCode.INVALID_REQUEST, eligibility.reason ?? 'This step cannot be restarted');
        }
        const given: unknown = action.overrides?.instruction;
        if (given !== undefined && typeof given !== 'string') {
          return failure(id, JsonRpcErrorCode.INVALID_PARAMS, 'overrides.instruction must be text');
        }
        const trimmed = given?.trim();
        const instruction = trimmed ? trimmed : null;
        if (instruction && instruction.length > MAX_RESTART_INSTRUCTION) {
          return failure(
            id,
            JsonRpcErrorCode.INVALID_PARAMS,
            `overrides.instruction must be at most ${MAX_RESTART_INSTRUCTION} characters`,
          );
        }
        const modelProfile = await this.snapshotModels(context, entryPoint);
        if ('error' in modelProfile) return failure(id, JsonRpcErrorCode.INVALID_REQUEST, modelProfile.error);
        const run = await this.runs.insertQueued({
          context,
          input: parent.input,
          documents: parent.documents,
          modelProfile: modelProfile.profile,
          accessControl: entryPoint.accessControl,
          maxAttempts: entryPoint.maxAttempts,
          restart: {
            parentRunId: parent.id,
            fromWorkUnitRunId: unit.workUnitId,
            fromWorkUnitSlug: unit.slug,
            resumeAt: entryPoint.restartPoints[unit.slug]!.resumeAt,
            instruction,
          },
        });
        await this.observability.emitQueued(context, run.id, `Run queued: a restart of ${parent.id} after ${unit.slug}`);
        return this.success(invoke, { runId: run.id, status: run.status });
      }
    }
  }

  /** The org's current models for the workflow's roles, or why a run cannot use them. */
  private async snapshotModels(
    context: ExecutionContext,
    entryPoint: RuntimeEntryPoint,
  ): Promise<{ profile: RunModelProfile } | { error: string }> {
    try {
      return { profile: await this.modelProfiles.snapshot(context.orgSlug, context.agentSlug, entryPoint.modelRoles) };
    } catch (error) {
      if (error instanceof MissingModelProfileError || error instanceof ModelUnavailableError) {
        return { error: error.message };
      }
      throw error;
    }
  }

  private success(invoke: A2AInvokeRequest, content: WorkflowInvokeResult): A2AInvokeSuccessResponse {
    return {
      jsonrpc: '2.0',
      id: invoke.id,
      result: {
        success: true,
        output: { content, outputType: 'json' },
        context: invoke.params.context,
      },
    };
  }
}
