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
import { WorkflowRegistry } from '../catalog/workflow.registry';
import { WorkflowCatalogService } from '../catalog/workflow-catalog.service';
import {
  WorkflowRunsRepository,
  WorkflowRunTransitionError,
  type WorkflowRunRecord,
} from '../shared/runs';
import {
  HumanReviewError,
  HumanReviewService,
  parseReviewResponse,
} from '../shared/reviews';
import { MissingModelProfileError, ModelUnavailableError } from '../shared/models';
import { ObservabilityService } from '../shared/services/observability.service';
import { restartEligibility } from '../shared/restarts/restart-eligibility';
import { WorkUnitTraceReader } from '../shared/work-units/work-unit-trace.reader';
import { WorkflowRunLauncher, type LaunchRefusal, type RuntimeEntryPoint } from './workflow-run-launcher.service';
import { QualityRequestError, TraceReviewService } from '../shared/quality';
import { AgentInputError, AgentOutputError, AgentUnavailableError } from '../shared/agents';

/** A restart instruction is a note to the agents, not a document. */
const MAX_RESTART_INSTRUCTION = 4000;

interface AuthorizedRequest {
  organizationSlug?: string;
}

type InvokeResponse = A2AInvokeSuccessResponse | A2AInvokeErrorResponse;
type RequestId = string | number | null;

function failure(id: RequestId, code: JsonRpcErrorCode, message: string): A2AInvokeErrorResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function codeOf(refusal: LaunchRefusal): JsonRpcErrorCode {
  return refusal.kind === 'refused' ? JsonRpcErrorCode.INVALID_REQUEST : JsonRpcErrorCode.INVALID_PARAMS;
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
 *   `trace.review` has the workflow's reviewer agent review one step or one
 *   agent call of the run (synchronously: one model call), and
 *   `improvement.request` files a proposal for the org admins.
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
    private readonly runs: WorkflowRunsRepository,
    private readonly reviews: HumanReviewService,
    private readonly launcher: WorkflowRunLauncher,
    private readonly observability: ObservabilityService,
    private readonly trace: WorkUnitTraceReader,
    private readonly quality: TraceReviewService,
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
    // Start and restart create the conversation (the
    // launcher); every other action is on an existing run, which the caller
    // must be able to read (its access rule, not who created the conversation:
    // a system-started run belongs to the org).

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
    let existing: WorkflowRunRecord | null = null;
    if (action.action !== 'start' && action.action !== 'restart') {
      existing = await this.runs.getReadable(context.conversationId, {
        userId: context.userId,
        organizationSlug: context.orgSlug,
      });
      if (!existing || existing.workflowSlug !== context.agentSlug) {
        return failure(id, JsonRpcErrorCode.INVALID_PARAMS, `No run ${context.conversationId} of this workflow`);
      }
    }
    switch (action.action) {
      case 'start': {
        const launched = await this.launcher.launch(entryPoint, {
          context,
          input: action.input,
          documents: action.documents ?? [],
          queuedMessage: `Run queued${action.documents?.length ? ` with ${action.documents.length} document(s)` : ''}`,
        });
        if (!launched.ok) return failure(id, codeOf(launched), launched.message);
        return this.success(invoke, { runId: launched.value.id, status: launched.value.status });
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
      case 'checklist.tick': {
        let ticked;
        try {
          ticked = await this.reviews.tick(context, action.reviewId, action.itemId, action.done);
        } catch (error) {
          if (error instanceof HumanReviewError) {
            return failure(
              id,
              error.code === 'conflict' ? JsonRpcErrorCode.INVALID_REQUEST : JsonRpcErrorCode.INVALID_PARAMS,
              error.message,
            );
          }
          throw error;
        }
        return this.success(invoke, { runId: context.conversationId, status: ticked.resumed ? 'queued' : 'awaiting_review' });
      }
      case 'restart': {
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
        const launched = await this.launcher.launch(entryPoint, {
          context,
          input: parent.input,
          documents: parent.documents,
          restart: {
            parentRunId: parent.id,
            fromWorkUnitRunId: unit.workUnitId,
            fromWorkUnitSlug: unit.slug,
            resumeAt: entryPoint.restartPoints[unit.slug]!.resumeAt,
            instruction,
          },
          queuedMessage: `Run queued: a restart of ${parent.id} after ${unit.slug}`,
        });
        if (!launched.ok) return failure(id, codeOf(launched), launched.message);
        return this.success(invoke, { runId: launched.value.id, status: launched.value.status });
      }
      case 'trace.review':
      case 'improvement.request': {
        if (action.runId !== context.conversationId) {
          return failure(id, JsonRpcErrorCode.INVALID_PARAMS, `${action.action}.runId must be the conversation the context names`);
        }
        const run = existing!;
        try {
          if (action.action === 'trace.review') {
            const traceReview = await this.quality.review(context, run, action.target, action.notes);
            return this.success(invoke, { runId: run.id, status: run.status, traceReview });
          }
          const improvementRequest = await this.quality.fileImprovement(context, run, action);
          return this.success(invoke, { runId: run.id, status: run.status, improvementRequest });
        } catch (error) {
          if (error instanceof QualityRequestError) {
            return failure(id, JsonRpcErrorCode.INVALID_PARAMS, error.message);
          }
          if (error instanceof MissingModelProfileError || error instanceof ModelUnavailableError) {
            return failure(id, JsonRpcErrorCode.INVALID_REQUEST, error.message);
          }
          // The review is recorded as failed; the reviewer's own failure is worth showing.
          if (error instanceof AgentUnavailableError || error instanceof AgentInputError || error instanceof AgentOutputError) {
            return failure(id, JsonRpcErrorCode.INTERNAL_ERROR, `The trace review failed: ${error.message}`);
          }
          throw error;
        }
      }
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
