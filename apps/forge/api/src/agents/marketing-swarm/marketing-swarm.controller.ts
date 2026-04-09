import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../../rbac/guards/rbac.guard';
import { RequirePermission } from '../../rbac/decorators/require-permission.decorator';
import { MarketingSwarmService } from './marketing-swarm.service';
import { MarketingSwarmRequestDto } from './dto';

/**
 * MarketingSwarmController
 *
 * REST API endpoints for the Marketing Swarm agent.
 *
 * Key change: The task and its configuration must already exist in the database
 * (created by the frontend when user submits the config form).
 * This endpoint just triggers execution.
 *
 * Endpoints:
 * - POST /marketing-swarm/execute - Start execution for an existing task
 * - GET /marketing-swarm/status/:taskId - Check execution status
 * - GET /marketing-swarm/state/:taskId - Get full execution state from DB
 *
 * ## Communication Protocol
 * These endpoints use REST for **internal** service-to-service communication
 * between the API app (apps/api) and the LangGraph app (apps/langgraph).
 * The A2A (Agent-to-Agent) JSON-RPC 2.0 protocol is handled at the API app
 * level by the AgentRunner, which translates A2A requests into REST calls
 * to these endpoints. External clients should use the API app's A2A endpoints,
 * not these internal REST endpoints directly.
 */
@Controller('marketing-swarm')
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
  @Post('execute')
  @HttpCode(HttpStatus.OK)
  async execute(@Body() request: MarketingSwarmRequestDto) {
    // ExecutionContext is required
    if (!request.context) {
      throw new BadRequestException('ExecutionContext is required');
    }

    const context = request.context;
    const taskId = context.conversationId;

    this.logger.log(
      `Received swarm execution request: conversationId=${taskId}`,
    );

    if (!taskId) {
      throw new BadRequestException('conversationId is required in context');
    }

    try {
      const result = await this.marketingSwarmService.execute({
        context,
        taskId,
      });

      // If execution failed, return error response
      if (result.status !== 'completed') {
        return {
          success: false,
          status: 'failed',
          error: result.error || 'Execution failed',
        };
      }

      // Return versioned deliverable for API runner to parse
      // This structure has type: 'versioned' which signals the API runner
      // to create multiple deliverable versions from the versions array
      if (result.versionedDeliverable) {
        return {
          success: true,
          data: result.versionedDeliverable,
        };
      }

      // Fallback to raw result if no versioned deliverable available
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error('Swarm execution failed:', error);
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Swarm execution failed',
      );
    }
  }

  /**
   * Get execution status by task ID
   */
  @Get('status/:taskId')
  @HttpCode(HttpStatus.OK)
  async getStatus(@Param('taskId') taskId: string) {
    this.logger.log(`Getting status for task: ${taskId}`);

    const status = await this.marketingSwarmService.getStatus(taskId);

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
  @Get('state/:taskId')
  @HttpCode(HttpStatus.OK)
  async getState(@Param('taskId') taskId: string) {
    this.logger.log(`Getting full state for task: ${taskId}`);

    const state = await this.marketingSwarmService.getFullState(taskId);

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
  @Get('deliverable/:taskId')
  @HttpCode(HttpStatus.OK)
  async getDeliverable(@Param('taskId') taskId: string) {
    this.logger.log(`Getting deliverable for task: ${taskId}`);

    const deliverable = await this.marketingSwarmService.getDeliverable(taskId);

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
  @Get('versioned-deliverable/:taskId')
  @HttpCode(HttpStatus.OK)
  async getVersionedDeliverable(@Param('taskId') taskId: string) {
    this.logger.log(`Getting versioned deliverable for task: ${taskId}`);

    const deliverable =
      await this.marketingSwarmService.getVersionedDeliverable(taskId);

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
  @Delete(':taskId')
  @HttpCode(HttpStatus.OK)
  async deleteTask(@Param('taskId') taskId: string) {
    this.logger.log(`Deleting task: ${taskId}`);

    const success = await this.marketingSwarmService.deleteTask(taskId);

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
  @Get('output/:outputId/versions')
  @HttpCode(HttpStatus.OK)
  async getOutputVersions(@Param('outputId') outputId: string) {
    this.logger.log(`Getting versions for output: ${outputId}`);

    const versions =
      await this.marketingSwarmService.getOutputVersions(outputId);

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
  @Get('output/:outputId')
  @HttpCode(HttpStatus.OK)
  async getOutput(@Param('outputId') outputId: string) {
    this.logger.log(`Getting output: ${outputId}`);

    const output = await this.marketingSwarmService.getOutputById(outputId);

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
  @Get('by-conversation/:conversationId')
  @HttpCode(HttpStatus.OK)
  async getTaskByConversation(@Param('conversationId') conversationId: string) {
    this.logger.log(`Getting task for conversation: ${conversationId}`);

    const task =
      await this.marketingSwarmService.getTaskByConversationId(conversationId);

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
}
