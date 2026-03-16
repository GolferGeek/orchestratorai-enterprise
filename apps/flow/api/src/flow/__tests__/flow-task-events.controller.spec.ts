import { Test, TestingModule } from '@nestjs/testing';
import { FlowTaskEventsController } from '../flow-task-events.controller';
import { FlowTaskEventsService } from '../flow-task-events.service';
import { WORK_TASK_SINK, WorkTaskSink } from '@orchestratorai/planes/work-routing/work-task-sink.interface';

describe('FlowTaskEventsController', () => {
  let controller: FlowTaskEventsController;
  let taskEventsService: jest.Mocked<FlowTaskEventsService>;
  let workTaskSink: jest.Mocked<WorkTaskSink>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FlowTaskEventsController],
      providers: [
        {
          provide: FlowTaskEventsService,
          useValue: {
            push: jest.fn(),
            getBufferedEvents: jest.fn().mockReturnValue([]),
            subscribe: jest.fn(),
            clearTask: jest.fn(),
          },
        },
        {
          provide: WORK_TASK_SINK,
          useValue: {
            createTask: jest.fn(),
            updateTaskStatus: jest.fn(),
            addTaskComment: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<FlowTaskEventsController>(FlowTaskEventsController);
    taskEventsService = module.get(FlowTaskEventsService);
    workTaskSink = module.get(WORK_TASK_SINK);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('ingest should push normalized event to task service', () => {
    const nowBefore = Date.now();
    const result = controller.ingest({
      taskId: 'task-1',
      eventType: 'agent.started',
      message: 'starting',
      payload: { step: 1 },
    });
    const nowAfter = Date.now();

    expect(result).toEqual({ ok: true });
    expect(taskEventsService.push).toHaveBeenCalledTimes(1);
    const firstCall = taskEventsService.push.mock.calls[0];
    if (!firstCall) {
      throw new Error('Expected push() to be called with event payload');
    }
    const pushed = firstCall[0];
    expect(pushed.taskId).toBe('task-1');
    expect(pushed.eventType).toBe('agent.started');
    expect(pushed.status).toBe('running');
    expect(pushed.message).toBe('starting');
    expect(pushed.sourceApp).toBe('claude-code-hook');
    expect(pushed.payload).toEqual({ step: 1 });
    expect(typeof pushed.timestamp).toBe('number');
    expect(pushed.timestamp).toBeGreaterThanOrEqual(nowBefore);
    expect(pushed.timestamp).toBeLessThanOrEqual(nowAfter);
  });

  it('createTask should call sink and return normalized response', async () => {
    workTaskSink.createTask.mockResolvedValue({
      id: '123',
      title: 'My task',
      provider: 'ado',
      externalId: '123',
    });

    const result = await controller.createTask({
      title: 'My task',
      description: 'test',
    });

    expect(workTaskSink.createTask).toHaveBeenCalledWith({
      title: 'My task',
      description: 'test',
    });
    expect(result).toEqual({
      ok: true,
      task: { id: '123', title: 'My task', provider: 'ado', externalId: '123' },
    });
  });

  it('updateTaskStatus should call sink', async () => {
    workTaskSink.updateTaskStatus.mockResolvedValue();

    const result = await controller.updateTaskStatus({
      taskId: '42',
      status: 'done',
    });

    expect(workTaskSink.updateTaskStatus).toHaveBeenCalledWith({
      taskId: '42',
      status: 'done',
    });
    expect(result).toEqual({ ok: true });
  });

  it('addTaskComment should call sink', async () => {
    workTaskSink.addTaskComment.mockResolvedValue();

    const result = await controller.addTaskComment({
      taskId: '42',
      comment: 'Looks good',
    });

    expect(workTaskSink.addTaskComment).toHaveBeenCalledWith({
      taskId: '42',
      comment: 'Looks good',
    });
    expect(result).toEqual({ ok: true });
  });
});
