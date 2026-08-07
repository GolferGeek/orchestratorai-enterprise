import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Logger,
  UseGuards,
  Req,
} from '@nestjs/common';
import type {
  A2AInvokeErrorResponse,
  A2AInvokeSuccessResponse,
} from '@orchestrator-ai/transport-types';
import { JsonRpcErrorCode } from '@orchestrator-ai/transport-types';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { MarketingSwarmService } from './marketing-swarm.service';
import type { WorkflowAccess } from './marketing-db.service';
import { validateMarketingSwarmInvoke } from './marketing-swarm-invoke-validation';

interface AuthorizedRequest {
  organizationSlug?: string;
}

/**
 * MarketingSwarmController
 *
 * REST API endpoints for the Marketing Swarm workflow.
 *
 * Key change: The task and its configuration must already exist in the database
 * (created by the frontend when user submits the config form).
 * This endpoint just triggers execution.
 *
 * Endpoints:
 * - POST /workflows/marketing-swarm/execute - Start execution for an existing task
 * - GET /workflows/marketing-swarm/status/:taskId - Check execution status
 * - GET /workflows/marketing-swarm/state/:taskId - Get full execution state from DB
 *
 * ## Communication Protocol
 * These endpoints use REST for **internal** service-to-service communication
 * between the API app (apps/api) and the LangGraph app (apps/langgraph).
 * The A2A (Agent-to-Agent) JSON-RPC 2.0 protocol is handled at the API app
 * level by the workflow runner, which translates A2A requests into REST calls
 * to these endpoints.
 */
@Controller('workflows')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class MarketingSwarmController {
  private readonly logger = new Logger(MarketingSwarmController.name);

  constructor(private readonly marketingSwarmService: MarketingSwarmService) {}

  /**
   * Execute the marketing swarm
   *
   * Phase 2: The task must already exist in marketing.swarm_tasks table.
   * The frontend creates the task with config when user submits the form.
   * This endpoint triggers the actual processing.
   *
   * Returns: Versioned deliverable structure that API runner can parse
   * to create multiple deliverable versions.
   */
  @Post('invoke')
  @HttpCode(HttpStatus.OK)
  async invoke(
    @Body() body: unknown,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ): Promise<A2AInvokeSuccessResponse | A2AInvokeErrorResponse> {
    const validation = validateMarketingSwarmInvoke(
      body,
      user.id,
      request.organizationSlug,
    );
    if (!validation.valid) {
      return {
        jsonrpc: '2.0',
        id: validation.id,
        error: {
          code: JsonRpcErrorCode.INVALID_PARAMS,
          message: validation.message,
        },
      };
    }

    this.logger.log(
      `Received swarm invocation: conversationId=${validation.context.conversationId}`,
    );
    try {
      const result = await this.marketingSwarmService.execute(validation.input);
      if (!result.versionedDeliverable) {
        throw new InternalServerErrorException(
          'Marketing Swarm completed without a versioned deliverable',
        );
      }

      return {
        jsonrpc: '2.0',
        id: validation.id,
        result: {
          success: true,
          output: {
            content: result.versionedDeliverable,
            outputType: 'json',
          },
          context: validation.context,
        },
      };
    } catch {
      this.logger.error('Marketing Swarm invocation failed');
      return {
        jsonrpc: '2.0',
        id: validation.id,
        error: {
          code: JsonRpcErrorCode.INTERNAL_ERROR,
          message: 'Workflow invocation failed',
        },
      };
    }
  }

  /**
   * Get execution status by task ID
   */
  @Get('marketing-swarm/status/:taskId')
  @HttpCode(HttpStatus.OK)
  async getStatus(
    @Param('taskId') taskId: string,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ) {
    this.logger.log(`Getting status for task: ${taskId}`);

    const status = await this.marketingSwarmService.getStatus(
      taskId,
      this.access(user, request),
    );

    if (!status) {
      throw new NotFoundException(`Swarm task not found: ${taskId}`);
    }

    return {
      success: true,
      data: status,
    };
  }

  /**
   * Get full execution state by task ID
   *
   * Returns all outputs and evaluations from the database.
   * Used for reconnection - frontend rebuilds UI from this data.
   */
  @Get('marketing-swarm/state/:taskId')
  @HttpCode(HttpStatus.OK)
  async getState(
    @Param('taskId') taskId: string,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ) {
    this.logger.log(`Getting full state for task: ${taskId}`);

    const state = await this.marketingSwarmService.getFullState(
      taskId,
      this.access(user, request),
    );

    if (!state) {
      throw new NotFoundException(`Swarm task not found: ${taskId}`);
    }

    return {
      success: true,
      data: {
        taskId,
        outputs: state.outputs,
        evaluations: state.evaluations,
      },
    };
  }

  /**
   * Get deliverable for a completed task
   *
   * Returns the top N ranked outputs with their full edit histories.
   * This is the JSON structure suitable for returning to API runner.
   */
  @Get('marketing-swarm/deliverable/:taskId')
  @HttpCode(HttpStatus.OK)
  async getDeliverable(
    @Param('taskId') taskId: string,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ) {
    this.logger.log(`Getting deliverable for task: ${taskId}`);

    const deliverable = await this.marketingSwarmService.getDeliverable(
      taskId,
      this.access(user, request),
    );

    if (!deliverable) {
      throw new NotFoundException(`Deliverable not found for task: ${taskId}`);
    }

    return {
      success: true,
      data: deliverable,
    };
  }

  /**
   * Get versioned deliverable for API runner
   *
   * Returns top N ranked outputs as versions in reverse order:
   * - Version 1 = lowest ranked (e.g., 5th place)
   * - Version N = highest ranked (1st place, winner)
   *
   * The `type: 'versioned'` field signals the API runner to create
   * multiple deliverable versions from the versions array.
   */
  @Get('marketing-swarm/versioned-deliverable/:taskId')
  @HttpCode(HttpStatus.OK)
  async getVersionedDeliverable(
    @Param('taskId') taskId: string,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ) {
    this.logger.log(`Getting versioned deliverable for task: ${taskId}`);

    const deliverable =
      await this.marketingSwarmService.getVersionedDeliverable(
        taskId,
        this.access(user, request),
      );

    if (!deliverable) {
      throw new NotFoundException(
        `Versioned deliverable not found for task: ${taskId}`,
      );
    }

    return {
      success: true,
      data: deliverable,
    };
  }

  /**
   * Delete a task and all associated data
   *
   * Deletes evaluations, outputs, and the swarm_task from the database.
   * Called when a conversation/deliverable is deleted from the API.
   */
  @Delete('marketing-swarm/:taskId')
  @HttpCode(HttpStatus.OK)
  async deleteTask(
    @Param('taskId') taskId: string,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ) {
    this.logger.log(`Deleting task: ${taskId}`);

    const success = await this.marketingSwarmService.deleteTask(
      taskId,
      this.access(user, request),
    );

    if (!success) {
      throw new NotFoundException(`Swarm task not found: ${taskId}`);
    }

    return {
      success: true,
      message: `Task ${taskId} and all associated data deleted`,
    };
  }

  /**
   * Get version history for a specific output
   *
   * Returns all versions of an output including:
   * - Initial write content
   * - Any rewrites after editor feedback
   * - Editor feedback that triggered each rewrite
   *
   * Used by frontend to show write/edit history in modal.
   */
  @Get('marketing-swarm/output/:outputId/versions')
  @HttpCode(HttpStatus.OK)
  async getOutputVersions(
    @Param('outputId') outputId: string,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ) {
    this.logger.log(`Getting versions for output: ${outputId}`);

    const versions = await this.marketingSwarmService.getOutputVersions(
      outputId,
      this.access(user, request),
    );

    if (!versions) {
      throw new NotFoundException(`Output not found: ${outputId}`);
    }

    return {
      success: true,
      data: {
        outputId,
        versions,
      },
    };
  }

  /**
   * Get a specific output by ID
   *
   * Returns full output details including current content, status,
   * writer/editor info, and scoring.
   */
  @Get('marketing-swarm/output/:outputId')
  @HttpCode(HttpStatus.OK)
  async getOutput(
    @Param('outputId') outputId: string,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ) {
    this.logger.log(`Getting output: ${outputId}`);

    const output = await this.marketingSwarmService.getOutputById(
      outputId,
      this.access(user, request),
    );

    if (!output) {
      throw new NotFoundException(`Output not found: ${outputId}`);
    }

    return {
      success: true,
      data: output,
    };
  }

  /**
   * Get task by conversation ID
   *
   * Looks up a swarm task using the conversation ID.
   * Used by frontend to restore task state when navigating to an existing conversation.
   */
  @Get('marketing-swarm/by-conversation/:conversationId')
  @HttpCode(HttpStatus.OK)
  async getTaskByConversation(
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: { id: string },
    @Req() request: AuthorizedRequest,
  ) {
    this.logger.log(`Getting task for conversation: ${conversationId}`);

    const task = await this.marketingSwarmService.getTaskByConversationId(
      conversationId,
      this.access(user, request),
    );

    if (!task) {
      throw new NotFoundException(
        `No task found for conversation: ${conversationId}`,
      );
    }

    return {
      success: true,
      data: task,
    };
  }

  private access(
    user: { id: string },
    request: AuthorizedRequest,
  ): WorkflowAccess {
    if (!request.organizationSlug) {
      throw new InternalServerErrorException(
        'Authorized organization was not bound to the request',
      );
    }
    return {
      userId: user.id,
      organizationSlug: request.organizationSlug,
    };
  }
}
