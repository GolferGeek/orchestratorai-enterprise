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
import { ConversationOwnershipService } from '../../common/conversations/conversation-ownership.service';
import {
  WorkflowInputError,
  WorkflowRegistry,
  type WorkflowEntryPoint,
} from '../catalog/workflow.registry';
import {
  WorkflowRunsRepository,
  WorkflowRunTransitionError,
} from '../shared/runs';

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
    private readonly conversations: ConversationOwnershipService,
    private readonly runs: WorkflowRunsRepository,
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
        if (action.documents && action.documents.length > 0) {
          return failure(id, JsonRpcErrorCode.INVALID_PARAMS, 'Document inputs are not available yet');
        }
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
        const run = await this.runs.insertQueued({
          context,
          input,
          accessControl: entryPoint.accessControl,
          maxAttempts: entryPoint.maxAttempts,
        });
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
        try {
          const run = await this.runs.requestCancel(context.orgSlug, action.runId);
          return this.success(invoke, { runId: run.id, status: run.status });
        } catch (error) {
          if (error instanceof WorkflowRunTransitionError) {
            return failure(id, JsonRpcErrorCode.INVALID_REQUEST, 'The run is not queued or running');
          }
          throw error;
        }
      }
      case 'review.submit':
      case 'answer.submit':
      case 'finish':
      case 'restart':
        return failure(
          id,
          JsonRpcErrorCode.INVALID_REQUEST,
          `Workflow action "${action.action}" is not available yet`,
        );
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
