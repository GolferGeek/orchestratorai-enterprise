import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { TasksService } from './tasks.service';
import { TaskStatusService } from './task-status.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { SupabaseAuthUserDto } from '@/auth/dto/auth.dto';
import {
  UpdateTaskDto,
  TaskQueryParams,
} from '@/agent2agent/types/agent-conversations.types';
import { ParameterValidator } from '@/common/guards/validation.guard';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly taskStatusService: TaskStatusService,
  ) {}

  /**
   * Validate task ID parameter (now using shared validator)
   */
  private validateTaskId(taskId: string, userId: string): void {
    ParameterValidator.validateTaskId(taskId, userId);
  }

  /**
   * List tasks for the current user
   * GET /tasks
   */
  @Get()
  async listTasks(
    @Query() query: TaskQueryParams,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ) {
    // Ensure user can only see their own tasks
    const params = {
      ...query,
      userId: currentUser.id,
    };

    return this.tasksService.listTasks(params);
  }

  /**
   * Get task metrics and analytics
   * GET /tasks/metrics
   */
  @Get('metrics')
  async getTaskMetrics(
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ): Promise<unknown> {
    return this.tasksService.getTaskMetrics(currentUser.id) as Promise<unknown>;
  }

  /**
   * Get a specific task by ID
   * GET /tasks/:id
   */
  @Get(':id')
  async getTask(
    @Param('id') taskId: string,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ) {
    this.validateTaskId(taskId, currentUser.id);

    const task = await this.tasksService.getTaskById(taskId, currentUser.id);

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  /**
   * Update a task
   * PUT /tasks/:id
   */
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async updateTask(
    @Param('id') taskId: string,
    @Body() updates: UpdateTaskDto,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ) {
    this.validateTaskId(taskId, currentUser.id);
    return this.tasksService.updateTask(taskId, currentUser.id, updates);
  }

  /**
   * Cancel a task
   * DELETE /tasks/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async cancelTask(
    @Param('id') taskId: string,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ) {
    this.validateTaskId(taskId, currentUser.id);
    await this.tasksService.cancelTask(taskId, currentUser.id);
    return { success: true, message: 'Task cancelled' };
  }

  /**
   * Get active tasks for the current user
   * GET /tasks/active
   */
  @Get('active')
  async getActiveTasks(@CurrentUser() currentUser: SupabaseAuthUserDto) {
    return this.tasksService.getActiveTasks(currentUser.id);
  }

  /**
   * Get real-time task status (for polling)
   * GET /tasks/:id/status
   */
  @Get(':id/status')
  getTaskStatus(
    @Param('id') taskId: string,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ) {
    this.validateTaskId(taskId, currentUser.id);

    const status = this.taskStatusService.getTaskStatus(taskId, currentUser.id);

    if (!status) {
      throw new NotFoundException('Task not found or not accessible');
    }

    return status;
  }

  /**
   * Stream task progress via Server-Sent Events
   * GET /tasks/:id/progress
   */
  @Get(':id/progress')
  async streamTaskProgress(
    @Param('id') taskId: string,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
    @Res() response: Response,
  ) {
    this.validateTaskId(taskId, currentUser.id);

    // Set SSE headers
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'Cache-Control, Content-Type, Authorization',
    });

    try {
      // Stream progress updates
      for await (const progressEvent of this.tasksService.streamTaskProgress(
        taskId,
        currentUser.id,
      )) {
        response.write(`data: ${JSON.stringify(progressEvent)}\n\n`);

        // End stream if task is completed
        if (
          progressEvent.status === 'completed' ||
          progressEvent.status === 'failed' ||
          progressEvent.status === 'cancelled'
        ) {
          break;
        }
      }
    } catch (error) {
      response.write(
        `data: ${JSON.stringify({
          error: 'Failed to stream progress',
          message: error instanceof Error ? error.message : 'Unknown error',
        })}\n\n`,
      );
    } finally {
      response.end();
    }
  }

  /**
   * Get accumulated task messages (for polling clients)
   * GET /tasks/:id/messages
   */
  @Get(':id/messages')
  async getTaskMessages(
    @Param('id') taskId: string,
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ) {
    this.validateTaskId(taskId, currentUser.id);

    // Use TaskStatusService for live messages first
    const liveMessages = this.taskStatusService.getTaskMessages(
      taskId,
      currentUser.id,
    );
    if (liveMessages.length > 0) {
      return liveMessages;
    }

    // Fallback to database (for task recovery/hydration)

    return this.tasksService.getTaskMessages(taskId, currentUser.id);
  }

  /**
   * Update task progress (for agents to call)
   * PUT /tasks/:id/progress
   */
  @Put(':id/progress')
  @HttpCode(HttpStatus.OK)
  async updateTaskProgress(
    @Param('id') taskId: string,
    @Body() body: { progress: number; message?: string },
    @CurrentUser() currentUser: SupabaseAuthUserDto,
  ) {
    this.validateTaskId(taskId, currentUser.id);

    await this.tasksService.updateTaskProgress(
      taskId,
      body.progress,
      body.message,
    );

    return { success: true };
  }
}
