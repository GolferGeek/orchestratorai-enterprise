import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WebhooksController } from './webhooks.controller';
import { DATABASE_SERVICE } from '../database';
import {
  ObservabilityWebhookService,
  ObservabilityEventsService,
} from '@orchestratorai/planes/observability';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let mockDb: {
    from: jest.Mock;
    rpc: jest.Mock;
  };
  let observabilityEvents: jest.Mocked<ObservabilityEventsService>;

  const mockExecutionContext = {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    conversationId: '550e8400-e29b-41d4-a716-446655440001',
    conversationId: 'conv-123',
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
            events$: { pipe: jest.fn() },
          },
        },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
    eventEmitter = module.get(EventEmitter2);
    observabilityEvents = module.get(ObservabilityEventsService);
  });

  describe('handleStatusUpdate', () => {
    it('should reject update without taskId', async () => {
      const update = {
        conversationId: '',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: mockExecutionContext,
      };

      await controller.handleStatusUpdate(update);

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should reject update without ExecutionContext', async () => {
      const update = {
        conversationId: 'conv-123',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: undefined as unknown as typeof mockExecutionContext,
      };

      await controller.handleStatusUpdate(update);

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should reject update with invalid ExecutionContext', async () => {
      const update = {
        conversationId: 'conv-123',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: {
          userId: 'user-123',
        } as unknown as typeof mockExecutionContext,
      };

      await controller.handleStatusUpdate(update);

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should emit workflow step progress event', async () => {
      const update = {
        conversationId: 'conv-123',
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
          conversationId: 'conv-123',
          step: 'processing',
          status: 'in_progress',
          progress: 50,
        }),
      );
    });

    it('should emit A2A stream chunk event with full context', async () => {
      const update = {
        conversationId: 'conv-123',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: mockExecutionContext,
        message: 'Processing...',
        mode: 'build',
      };

      await controller.handleStatusUpdate(update);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent.stream.chunk',
        expect.objectContaining({
          context: mockExecutionContext,
          streamId: 'task-123',
          mode: 'build',
        }),
      );
    });

    it('should store observability event in database', async () => {
      const update = {
        conversationId: 'conv-123',
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
        conversationId: 'conv-123',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: mockExecutionContext,
      };

      await controller.handleStatusUpdate(update);

      expect(observabilityEvents.push).toHaveBeenCalledWith(
        expect.objectContaining({
          context: mockExecutionContext,
          source_app: 'orchestrator-ai',
          hook_event_type: 'in_progress',
        }),
      );
    });

    it('should emit workflow status update event', async () => {
      const update = {
        conversationId: 'conv-123',
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
          conversationId: 'conv-123',
          event: 'workflow_status_update',
        }),
      );
    });

    it('should validate UUID format for database storage', async () => {
      const updateWithInvalidUUIDs = {
        conversationId: 'conv-123',
        status: 'in_progress',
        timestamp: new Date().toISOString(),
        context: {
          ...mockExecutionContext,
          userId: 'not-a-uuid',
          conversationId: 'also-not-a-uuid',
        },
      };

      await controller.handleStatusUpdate(updateWithInvalidUUIDs);

      expect(mockDb.from).toHaveBeenCalled();
    });
  });

  describe('ExecutionContext pattern compliance', () => {
    it('should include full ExecutionContext in observability event', async () => {
      const update = {
        conversationId: 'conv-123',
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
