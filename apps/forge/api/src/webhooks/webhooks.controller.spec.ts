import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WebhooksController } from './webhooks.controller';
import { TasksService } from '../agent2agent/tasks/tasks.service';
import { StreamingService } from '../agent2agent/services/streaming.service';
import { DATABASE_SERVICE } from '../database';
import { ObservabilityWebhookService } from '../observability/observability-webhook.service';
import { ObservabilityEventsService } from '../observability/observability-events.service';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let tasksService: jest.Mocked<TasksService>;
  let streamingService: jest.Mocked<StreamingService>;
  let mockDb: any;
  let observabilityEvents: jest.Mocked<ObservabilityEventsService>;

  const mockExecutionContext = {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    conversationId: '550e8400-e29b-41d4-a716-446655440001',
    taskId: 'task-123',
    agentSlug: 'test-agent',
    orgSlug: 'test-org',
    agentType: 'context' as const,
    provider: 'anthropic',
    model: 'claude-3-sonnet',
    planId: '00000000-0000-0000-0000-000000000000',
    deliverableId: '550e8400-e29b-41d4-a716-446655440002',
  };

  const mockFromResult = {
    insert: jest.fn().mockResolvedValue({ error: null }),
  };

  beforeEach(async () => {
    mockDb = {
      from: jest.fn().mockReturnValue(mockFromResult),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: TasksService,
          useValue: {
            emitTaskMessage: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: StreamingService,
          useValue: {
            emitProgress: jest.fn(),
          },
        },
        {
          provide: DATABASE_SERVICE,
          useValue: mockDb,
        },
        {
          provide: ObservabilityWebhookService,
          useValue: {
            sendEvent: jest.fn(),
          },
        },
        {
          provide: ObservabilityEventsService,
          useValue: {
            push: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
    eventEmitter = module.get(EventEmitter2);
    tasksService = module.get(TasksService);
    streamingService = module.get(StreamingService);
    observabilityEvents = module.get(ObservabilityEventsService);
  });

  describe('handleStatusUpdate', () => {
    it('should process valid status update with ExecutionContext', async () => {
      const update = {
        taskId: 'task-123',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: mockExecutionContext,
        message: 'Processing step 1',
      };

      await controller.handleStatusUpdate(update);

      // Verify streaming service receives full context (not destructured fields)
      expect(streamingService.emitProgress).toHaveBeenCalledWith(
        mockExecutionContext, // Full context passed
        'Processing step 1',
        '',
        expect.objectContaining({
          status: 'in_progress',
        }),
      );
    });

    it('should reject update without taskId', async () => {
      const update = {
        taskId: '',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: mockExecutionContext,
      };

      await controller.handleStatusUpdate(update);

      // Should not emit any events
      expect(streamingService.emitProgress).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should reject update without ExecutionContext', async () => {
      const update = {
        taskId: 'task-123',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: undefined as any,
      };

      await controller.handleStatusUpdate(update);

      // Should not emit any events
      expect(streamingService.emitProgress).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should reject update with invalid ExecutionContext', async () => {
      const update = {
        taskId: 'task-123',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: { userId: 'user-123' } as any, // Missing required fields
      };

      await controller.handleStatusUpdate(update);

      // Should not emit any events
      expect(streamingService.emitProgress).not.toHaveBeenCalled();
    });

    it('should emit workflow step progress event', async () => {
      const update = {
        taskId: 'task-123',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: mockExecutionContext,
        step: 'processing',
        percent: 50,
      };

      await controller.handleStatusUpdate(update);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'workflow.step.progress',
        expect.objectContaining({
          taskId: 'task-123',
          step: 'processing',
          status: 'in_progress',
          progress: 50,
        }),
      );
    });

    it('should create task message when message is provided', async () => {
      const update = {
        taskId: 'task-123',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: mockExecutionContext,
        message: 'Processing data...',
      };

      await controller.handleStatusUpdate(update);

      expect(tasksService.emitTaskMessage).toHaveBeenCalledWith(
        'task-123',
        mockExecutionContext.userId,
        'Processing data...',
        'progress',
        expect.any(Number),
        expect.any(Object),
      );
    });

    it('should not create task message when message is not provided', async () => {
      const update = {
        taskId: 'task-123',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: mockExecutionContext,
      };

      await controller.handleStatusUpdate(update);

      expect(tasksService.emitTaskMessage).not.toHaveBeenCalled();
    });

    it('should emit SSE progress via streaming service with full context', async () => {
      const update = {
        taskId: 'task-123',
        status: 'completed',
        timestamp: new Date().toISOString(),
        context: mockExecutionContext,
        message: 'Done!',
        userMessage: 'Original request',
        mode: 'build',
      };

      await controller.handleStatusUpdate(update);

      expect(streamingService.emitProgress).toHaveBeenCalledWith(
        mockExecutionContext, // Verify full context is passed
        'Done!',
        'Original request',
        expect.objectContaining({
          status: 'completed',
          mode: 'build',
        }),
      );
    });

    it('should store observability event in database', async () => {
      const update = {
        taskId: 'task-123',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: mockExecutionContext,
        message: 'Processing...',
      };

      await controller.handleStatusUpdate(update);

      expect(mockDb.from).toHaveBeenCalledWith(null, 'observability_events');
      expect(mockFromResult.insert).toHaveBeenCalled();
    });

    it('should push event to observability events service with full context', async () => {
      const update = {
        taskId: 'task-123',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: mockExecutionContext,
      };

      await controller.handleStatusUpdate(update);

      expect(observabilityEvents.push).toHaveBeenCalledWith(
        expect.objectContaining({
          context: mockExecutionContext, // Full context in event
          source_app: 'orchestrator-ai',
          hook_event_type: 'in_progress',
        }),
      );
    });

    it('should emit workflow status update event', async () => {
      const update = {
        taskId: 'task-123',
        status: 'completed',
        timestamp: new Date().toISOString(),
        context: mockExecutionContext,
        executionId: 'exec-456',
        workflowId: 'wf-789',
      };

      await controller.handleStatusUpdate(update);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'workflow.status.update',
        expect.objectContaining({
          taskId: 'task-123',
          event: 'workflow_status_update',
        }),
      );
    });

    it('should handle sequence tracking from update', async () => {
      const update = {
        taskId: 'task-123',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: mockExecutionContext,
        sequence: 3,
        totalSteps: 5,
      };

      await controller.handleStatusUpdate(update);

      expect(streamingService.emitProgress).toHaveBeenCalledWith(
        mockExecutionContext,
        expect.any(String),
        '',
        expect.objectContaining({
          sequence: 3,
          totalSteps: 5,
        }),
      );
    });

    it('should handle sequence tracking from nested data object', async () => {
      const update = {
        taskId: 'task-123',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: mockExecutionContext,
        data: {
          sequence: 2,
          totalSteps: 4,
        },
      };

      await controller.handleStatusUpdate(update);

      expect(streamingService.emitProgress).toHaveBeenCalledWith(
        mockExecutionContext,
        expect.any(String),
        '',
        expect.objectContaining({
          sequence: 2,
          totalSteps: 4,
        }),
      );
    });

    it('should calculate progress for known statuses', async () => {
      const statuses = [
        { status: 'started', expectedProgress: 1 },
        { status: 'in_progress', expectedProgress: 25 },
        { status: 'completed', expectedProgress: 100 },
      ];

      for (const { status, expectedProgress } of statuses) {
        jest.clearAllMocks();

        const update = {
          taskId: 'task-123',
          status,
          timestamp: new Date().toISOString(),
          context: mockExecutionContext,
        };

        await controller.handleStatusUpdate(update);

        expect(streamingService.emitProgress).toHaveBeenCalledWith(
          mockExecutionContext,
          expect.any(String),
          '',
          expect.objectContaining({
            progress: expectedProgress,
          }),
        );
      }
    });

    it('should use percent from update when provided', async () => {
      const update = {
        taskId: 'task-123',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: mockExecutionContext,
        percent: 75,
      };

      await controller.handleStatusUpdate(update);

      expect(streamingService.emitProgress).toHaveBeenCalledWith(
        mockExecutionContext,
        expect.any(String),
        '',
        expect.objectContaining({
          progress: 75,
        }),
      );
    });

    it('should handle task message emission errors gracefully', async () => {
      tasksService.emitTaskMessage.mockRejectedValue(
        new Error('Database error'),
      );

      const update = {
        taskId: 'task-123',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: mockExecutionContext,
        message: 'Test message',
      };

      // Should not throw
      await expect(
        controller.handleStatusUpdate(update),
      ).resolves.toBeUndefined();

      // Should still emit other events
      expect(streamingService.emitProgress).toHaveBeenCalled();
    });

    it('should validate UUID format for database storage', async () => {
      const updateWithInvalidUUIDs = {
        taskId: 'task-123',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: {
          ...mockExecutionContext,
          userId: 'not-a-uuid',
          conversationId: 'also-not-a-uuid',
        },
      };

      await controller.handleStatusUpdate(updateWithInvalidUUIDs);

      // Should still process but with null UUIDs in database
      expect(mockDb.from).toHaveBeenCalled();
    });

    it('should build status history for task', async () => {
      const update1 = {
        taskId: 'task-history',
        status: 'started',
        timestamp: new Date().toISOString(),
        context: mockExecutionContext,
      };

      const update2 = {
        taskId: 'task-history',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: mockExecutionContext,
      };

      await controller.handleStatusUpdate(update1);
      await controller.handleStatusUpdate(update2);

      // Both updates should be processed
      expect(eventEmitter.emit).toHaveBeenCalledTimes(8); // 4 events per update
    });
  });

  describe('ExecutionContext pattern compliance', () => {
    it('should pass full ExecutionContext to streaming service', async () => {
      const update = {
        taskId: 'task-123',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: mockExecutionContext,
      };

      await controller.handleStatusUpdate(update);

      // Verify the first argument is the full context object
      const callArgs = streamingService.emitProgress.mock.calls[0];
      expect(callArgs![0]).toEqual(mockExecutionContext);
      expect(callArgs![0]).toHaveProperty('userId');
      expect(callArgs![0]).toHaveProperty('conversationId');
      expect(callArgs![0]).toHaveProperty('taskId');
      expect(callArgs![0]).toHaveProperty('agentSlug');
      expect(callArgs![0]).toHaveProperty('orgSlug');
    });

    it('should include full ExecutionContext in observability event', async () => {
      const update = {
        taskId: 'task-123',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: mockExecutionContext,
      };

      await controller.handleStatusUpdate(update);

      const pushCallArgs = observabilityEvents.push.mock.calls[0];
      expect(pushCallArgs![0]).toHaveProperty('context');
      expect(pushCallArgs![0].context).toEqual(mockExecutionContext);
    });
  });
});
