import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StreamingService } from './streaming.service';
import { TaskStatusService } from '../tasks/task-status.service';
import { ObservabilityEventsService } from '../../observability/observability-events.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

describe('StreamingService', () => {
  let service: StreamingService;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let taskStatusService: jest.Mocked<TaskStatusService>;
  let observabilityEvents: jest.Mocked<ObservabilityEventsService>;

  const mockContext = createMockExecutionContext({
    orgSlug: 'test-org',
    userId: 'user-123',
    conversationId: 'conv-123',
    taskId: 'task-123',
    agentSlug: 'test-agent',
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StreamingService,
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: TaskStatusService,
          useValue: {
            registerStreamSession: jest.fn(),
          },
        },
        {
          provide: ObservabilityEventsService,
          useValue: {
            push: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StreamingService>(StreamingService);
    eventEmitter = module.get(EventEmitter2);
    taskStatusService = module.get(TaskStatusService);
    observabilityEvents = module.get(ObservabilityEventsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerStream', () => {
    it('should register stream session with task status service', () => {
      const streamId = service.registerStream(
        mockContext,
        'build',
        'Test message',
      );

      expect(streamId).toBe('task-123'); // streamId = taskId
      expect(taskStatusService.registerStreamSession).toHaveBeenCalledWith({
        taskId: 'task-123',
        streamId: 'task-123',
        agentSlug: 'test-agent',
        organizationSlug: 'test-org',
        userId: 'user-123',
        conversationId: 'conv-123',
      });
    });

    it('should use taskId as streamId', () => {
      const streamId = service.registerStream(
        mockContext,
        'converse',
        'Test message',
      );

      expect(streamId).toBe(mockContext.taskId);
    });

    it('should handle conversationId from context', () => {
      const contextWithCustomConversation = createMockExecutionContext({
        orgSlug: 'test-org',
        userId: 'user-123',
        taskId: 'task-456',
        agentSlug: 'test-agent',
        conversationId: 'custom-conv-id',
      });

      const streamId = service.registerStream(
        contextWithCustomConversation,
        'build',
        'Test',
      );

      expect(streamId).toBe('task-456');
      expect(taskStatusService.registerStreamSession).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'custom-conv-id',
        }),
      );
    });
  });

  describe('emitProgress', () => {
    it('should emit A2A formatted stream chunk event', () => {
      service.emitProgress(mockContext, 'Processing step 1', 'User message', {
        step: 'validation',
        progress: 50,
        status: 'in_progress',
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent.stream.chunk',
        expect.objectContaining({
          context: mockContext,
          streamId: 'task-123',
          mode: 'build',
          userMessage: 'User message',
          timestamp: expect.any(String),
          chunk: {
            type: 'progress',
            content: 'Processing step 1',
            metadata: {
              step: 'validation',
              progress: 50,
              status: 'in_progress',
            },
          },
        }),
      );
    });

    it('should push event to observability buffer', () => {
      service.emitProgress(mockContext, 'Test content', 'User message', {
        step: 'processing',
        progress: 75,
      });

      expect(observabilityEvents.push).toHaveBeenCalledWith(
        expect.objectContaining({
          context: mockContext,
          source_app: 'orchestrator-ai',
          hook_event_type: 'agent.stream.chunk',
          status: 'agent.stream.chunk',
          message: 'Test content',
          progress: 75,
          step: 'processing',
          payload: {
            step: 'processing',
            progress: 75,
          },
          timestamp: expect.any(Number),
        }),
      );
    });

    it('should handle metadata with sequence and totalSteps', () => {
      service.emitProgress(mockContext, 'Step 2 of 5', 'User message', {
        step: 'processing',
        progress: 40,
        sequence: 2,
        totalSteps: 5,
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent.stream.chunk',
        expect.objectContaining({
          chunk: expect.objectContaining({
            metadata: expect.objectContaining({
              sequence: 2,
              totalSteps: 5,
            }),
          }),
        }),
      );
    });

    it('should use default mode if not provided in metadata', () => {
      service.emitProgress(mockContext, 'Test', 'User message');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent.stream.chunk',
        expect.objectContaining({
          mode: 'build', // default
        }),
      );
    });

    it('should use mode from metadata if provided', () => {
      service.emitProgress(mockContext, 'Test', 'User message', {
        mode: 'converse',
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent.stream.chunk',
        expect.objectContaining({
          mode: 'converse',
        }),
      );
    });

    it('should handle empty metadata', () => {
      service.emitProgress(mockContext, 'Test', 'User message');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent.stream.chunk',
        expect.objectContaining({
          chunk: expect.objectContaining({
            metadata: {},
          }),
        }),
      );
    });
  });

  describe('emitObservabilityOnly', () => {
    it('should push to observability without emitting SSE event', () => {
      service.emitObservabilityOnly(
        mockContext,
        'agent.started',
        'Agent execution started',
        {
          mode: 'build',
        },
      );

      expect(observabilityEvents.push).toHaveBeenCalledWith(
        expect.objectContaining({
          context: mockContext,
          source_app: 'orchestrator-ai',
          hook_event_type: 'agent.started',
          status: 'agent.started',
          message: 'Agent execution started',
          payload: {
            mode: 'build',
          },
          timestamp: expect.any(Number),
        }),
      );

      // Should NOT emit SSE event
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should handle complex metadata', () => {
      service.emitObservabilityOnly(
        mockContext,
        'agent.progress',
        'Processing...',
        {
          step: 'validation',
          progress: 50,
          mode: 'build',
          customData: { foo: 'bar' },
        },
      );

      expect(observabilityEvents.push).toHaveBeenCalledWith(
        expect.objectContaining({
          progress: 50,
          step: 'validation',
          payload: expect.objectContaining({
            step: 'validation',
            progress: 50,
            mode: 'build',
            customData: { foo: 'bar' },
          }),
        }),
      );
    });
  });

  describe('emitComplete', () => {
    it('should emit A2A formatted complete event', () => {
      service.emitComplete(mockContext, 'User message', 'build');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent.stream.complete',
        expect.objectContaining({
          context: mockContext,
          streamId: 'task-123',
          mode: 'build',
          userMessage: 'User message',
          timestamp: expect.any(String),
          type: 'complete',
        }),
      );
    });

    it('should emit complete event for different modes', () => {
      service.emitComplete(mockContext, 'User message', 'converse');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent.stream.complete',
        expect.objectContaining({
          mode: 'converse',
          type: 'complete',
        }),
      );
    });
  });

  describe('emitError', () => {
    it('should emit A2A formatted error event', () => {
      service.emitError(
        mockContext,
        'User message',
        'build',
        'Test error message',
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent.stream.error',
        expect.objectContaining({
          context: mockContext,
          streamId: 'task-123',
          mode: 'build',
          userMessage: 'User message',
          timestamp: expect.any(String),
          type: 'error',
          error: 'Test error message',
        }),
      );
    });

    it('should log error message', () => {
      const loggerSpy = jest.spyOn(service['logger'], 'error');

      service.emitError(mockContext, 'User message', 'plan', 'Critical error');

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Stream error for task task-123'),
      );
    });
  });

  describe('ExecutionContext flow', () => {
    it('should pass ExecutionContext through all emit methods', () => {
      const customContext = createMockExecutionContext({
        orgSlug: 'custom-org',
        userId: 'user-456',
        conversationId: 'conv-456',
        taskId: 'task-456',
        agentSlug: 'custom-agent',
      });

      service.emitProgress(customContext, 'Test', 'Message');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent.stream.chunk',
        expect.objectContaining({
          context: customContext,
        }),
      );

      expect(observabilityEvents.push).toHaveBeenCalledWith(
        expect.objectContaining({
          context: customContext,
        }),
      );
    });

    it('should maintain ExecutionContext in complete event', () => {
      service.emitComplete(mockContext, 'Message', 'build');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent.stream.complete',
        expect.objectContaining({
          context: mockContext,
        }),
      );
    });

    it('should maintain ExecutionContext in error event', () => {
      service.emitError(mockContext, 'Message', 'build', 'Error');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent.stream.error',
        expect.objectContaining({
          context: mockContext,
        }),
      );
    });
  });

  describe('timestamp handling', () => {
    it('should generate ISO timestamp for SSE events', () => {
      const beforeTime = Date.now();
      service.emitProgress(mockContext, 'Test', 'Message');
      const afterTime = Date.now();

      const emitCall = eventEmitter.emit.mock.calls[0]?.[1];
      const timestamp = emitCall.timestamp;

      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      const timestampMs = new Date(timestamp).getTime();
      expect(timestampMs).toBeGreaterThanOrEqual(beforeTime);
      expect(timestampMs).toBeLessThanOrEqual(afterTime);
    });

    it('should generate numeric timestamp for observability events', () => {
      const beforeTime = Date.now();
      service.emitProgress(mockContext, 'Test', 'Message');
      const afterTime = Date.now();

      const pushCall = observabilityEvents.push.mock.calls[0]?.[0] as any;
      const timestamp = pushCall.timestamp;

      expect(typeof timestamp).toBe('number');
      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('observability integration', () => {
    it('should emit SSE event even if observability push is voided', () => {
      // Mock observability push to verify it's called
      observabilityEvents.push.mockResolvedValue(undefined);

      service.emitProgress(mockContext, 'Test', 'Message');

      // Both should be called
      expect(eventEmitter.emit).toHaveBeenCalled();
      expect(observabilityEvents.push).toHaveBeenCalledWith(
        expect.objectContaining({
          context: mockContext,
          hook_event_type: 'agent.stream.chunk',
        }),
      );
    });
  });
});
