import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Sse,
  Logger,
} from '@nestjs/common';
import { Observable, merge, map, interval } from 'rxjs';
import { FlowTaskEventsService, TaskEvent } from './flow-task-events.service';
import { Inject } from '@nestjs/common';
import {
  WORK_TASK_SINK,
  WorkTaskSink,
} from '@orchestratorai/planes/work-routing/work-task-sink.interface';
import {
  AddTaskCommentBodyDto,
  CreateTaskBodyDto,
  CreateTaskResponseDto,
  IngestEventDto,
  UpdateTaskStatusBodyDto,
} from './flow-task-events.dto';

/**
 * Dedicated SSE endpoint for Flow task events.
 * - POST /flow/task-events  — hooks push events here
 * - GET  /flow/task-events/stream?taskId=xxx — frontend SSE stream
 * - POST /flow/task-events/create-task — OpenClaw creates tasks here
 *
 * No auth on POST (internal hook use). Auth on GET via query token.
 */
@Controller('flow/task-events')
export class FlowTaskEventsController {
  private readonly logger = new Logger(FlowTaskEventsController.name);

  constructor(
    private readonly taskEvents: FlowTaskEventsService,
    @Inject(WORK_TASK_SINK)
    private readonly workTaskSink: WorkTaskSink,
  ) {}

  /**
   * Ingest endpoint for Claude Code hooks.
   * Hooks POST here with event data including the taskId.
   */
  @Post()
  ingest(@Body() dto: IngestEventDto): { ok: boolean } {
    const event: TaskEvent = {
      taskId: dto.taskId,
      eventType: dto.eventType,
      status: dto.status || 'running',
      message: dto.message || null,
      step: dto.step || null,
      toolName: dto.toolName || null,
      sessionId: dto.sessionId || null,
      sourceApp: dto.sourceApp || 'claude-code-hook',
      timestamp: Date.now(),
      payload: dto.payload || {},
    };

    this.taskEvents.push(event);
    return { ok: true };
  }

  /**
   * Create a Flow task directly. Used by OpenClaw via exec("curl ...").
   * Inserts into orch_flow.shared_tasks and returns the created task.
   */
  @Post('create-task')
  async createTask(
    @Body() body: CreateTaskBodyDto,
  ): Promise<CreateTaskResponseDto> {
    const created = await this.workTaskSink.createTask(body);
    this.logger.log(
      `Task created via ${created.provider} sink: ${created.id} — ${created.title}`,
    );
    return {
      ok: true,
      task: {
        id: created.id,
        title: created.title,
        provider: created.provider,
        externalId: created.externalId,
      },
    };
  }

  @Post('update-task-status')
  async updateTaskStatus(@Body() body: UpdateTaskStatusBodyDto): Promise<{
    ok: boolean;
  }> {
    await this.workTaskSink.updateTaskStatus({
      taskId: body.taskId,
      status: body.status,
    });
    return { ok: true };
  }

  @Post('add-task-comment')
  async addTaskComment(
    @Body() body: AddTaskCommentBodyDto,
  ): Promise<{ ok: boolean }> {
    await this.workTaskSink.addTaskComment({
      taskId: body.taskId,
      comment: body.comment,
    });
    return { ok: true };
  }

  /**
   * SSE stream for a specific task.
   * Frontend connects here to receive real-time progress.
   */
  @Get('stream')
  @Sse()
  stream(
    @Query('taskId') taskId: string,
    @Query('token') _token: string,
  ): Observable<MessageEvent> {
    if (!taskId) {
      return new Observable((subscriber) => {
        subscriber.next({
          data: JSON.stringify({ error: 'taskId query parameter is required' }),
        } as MessageEvent);
        subscriber.complete();
      });
    }

    this.logger.log(`SSE stream opened for task ${taskId}`);

    // Replay buffered events, then stream live
    const buffered = this.taskEvents.getBufferedEvents(taskId);
    const bufferedEvents$ = new Observable<TaskEvent>((subscriber) => {
      for (const event of buffered) {
        subscriber.next(event);
      }
      subscriber.complete();
    });

    const liveEvents$ = this.taskEvents.subscribe(taskId);

    // Heartbeat every 15s to keep connection alive
    const heartbeat$ = interval(15000).pipe(
      map(
        () =>
          ({
            data: ':heartbeat',
            type: 'heartbeat',
          }) as unknown as TaskEvent,
      ),
    );

    return merge(
      bufferedEvents$.pipe(
        map(
          (event) =>
            ({
              data: JSON.stringify(event),
              type: 'task-event',
            }) as MessageEvent,
        ),
      ),
      liveEvents$.pipe(
        map(
          (event) =>
            ({
              data: JSON.stringify(event),
              type: 'task-event',
            }) as MessageEvent,
        ),
      ),
      heartbeat$.pipe(
        map(
          () =>
            ({
              data: '',
              type: 'heartbeat',
            }) as MessageEvent,
        ),
      ),
    );
  }
}
