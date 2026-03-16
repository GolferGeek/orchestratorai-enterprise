import { Test, TestingModule } from '@nestjs/testing';
import { SseEventMapperService } from '../sse-event-mapper.service';
import { ObservabilityEventRecord } from '../../../observability/observability-events.service';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { Response } from 'express';

describe('SseEventMapperService', () => {
  let service: SseEventMapperService;

  const mockContext = createMockExecutionContext({
    orgSlug: 'test-org',
    userId: 'user-123',
    conversationId: 'conv-123',
    taskId: 'task-abc',
    agentSlug: 'my-agent',
  });

  const makeEvent = (
    overrides: Partial<ObservabilityEventRecord> = {},
  ): ObservabilityEventRecord => ({
    context: mockContext,
    source_app: 'orchestrator-api',
    hook_event_type: 'agent.progress',
    status: 'running',
    message: 'Step 1 complete',
    progress: 50,
    step: 'processing',
    payload: {},
    timestamp: Date.now(),
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SseEventMapperService],
    }).compile();

    service = module.get<SseEventMapperService>(SseEventMapperService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('matchesObservabilityEvent', () => {
    const filters = {
      taskId: 'task-abc',
      agentSlug: 'my-agent',
      organizationSlug: 'test-org',
    };

    it('should return true for matching event', () => {
      const event = makeEvent();
      expect(service.matchesObservabilityEvent(event, filters)).toBe(true);
    });

    it('should return false for different taskId', () => {
      const event = makeEvent({
        context: createMockExecutionContext({
          ...mockContext,
          taskId: 'other-task',
        }),
      });
      expect(service.matchesObservabilityEvent(event, filters)).toBe(false);
    });

    it('should return false for different organization', () => {
      const event = makeEvent({
        context: createMockExecutionContext({
          ...mockContext,
          orgSlug: 'other-org',
        }),
      });
      expect(service.matchesObservabilityEvent(event, filters)).toBe(false);
    });

    it('should filter by conversationId when provided', () => {
      const filtersWithConv = {
        ...filters,
        conversationId: 'conv-123',
      };
      const event = makeEvent();
      expect(service.matchesObservabilityEvent(event, filtersWithConv)).toBe(
        true,
      );
    });

    it('should return false when conversationId does not match', () => {
      const filtersWithConv = {
        ...filters,
        conversationId: 'other-conv',
      };
      const event = makeEvent();
      expect(service.matchesObservabilityEvent(event, filtersWithConv)).toBe(
        false,
      );
    });

    it('should normalize empty orgSlug to "global" for matching', () => {
      const globalFilters = {
        taskId: 'task-abc',
        agentSlug: 'my-agent',
        organizationSlug: 'global',
      };
      const event = makeEvent({
        context: createMockExecutionContext({
          ...mockContext,
          orgSlug: '',
        }),
      });
      expect(service.matchesObservabilityEvent(event, globalFilters)).toBe(
        true,
      );
    });
  });

  describe('toChunkSseEventFromObservability', () => {
    it('should build a chunk SSE event from observability record', () => {
      const event = makeEvent({ message: 'Processing step' });
      const result = service.toChunkSseEventFromObservability(event);

      expect(result).not.toBeNull();
      expect(result!.event).toBe('agent_stream_chunk');
      expect(result!.data.chunk.type).toBe('progress');
    });

    it('should return null when event context is missing', () => {
      const event = makeEvent({ context: undefined as never });
      const result = service.toChunkSseEventFromObservability(event);
      expect(result).toBeNull();
    });

    it('should include progress and step in chunk metadata', () => {
      const event = makeEvent({ progress: 75, step: 'analysis' });
      const result = service.toChunkSseEventFromObservability(event);

      expect(result!.data.chunk.metadata?.progress).toBe(75);
      expect(result!.data.chunk.metadata?.step).toBe('analysis');
    });

    it('should resolve content from event message', () => {
      const event = makeEvent({ message: 'Hello from agent' });
      const result = service.toChunkSseEventFromObservability(event);

      expect(result!.data.chunk.content).toBe('Hello from agent');
    });

    it('should resolve content from payload.message when event.message is empty', () => {
      const event = makeEvent({
        message: '',
        payload: { message: 'Payload message' },
      });
      const result = service.toChunkSseEventFromObservability(event);

      expect(result!.data.chunk.content).toBe('Payload message');
    });

    it('should fall back to hook_event_type when both messages are empty', () => {
      const event = makeEvent({
        message: '',
        payload: {},
        hook_event_type: 'agent.step.completed',
      });
      const result = service.toChunkSseEventFromObservability(event);

      expect(result!.data.chunk.content).toBe('agent.step.completed');
    });

    it('should include full ExecutionContext in chunk data', () => {
      const event = makeEvent();
      const result = service.toChunkSseEventFromObservability(event);

      expect(result!.data.context).toBe(mockContext);
    });
  });

  describe('toCompleteSseEventFromObservability', () => {
    it('should build a complete SSE event', () => {
      const event = makeEvent({ hook_event_type: 'agent.completed' });
      const result = service.toCompleteSseEventFromObservability(event);

      expect(result).not.toBeNull();
      expect(result!.event).toBe('agent_stream_complete');
      expect(result!.data.type).toBe('complete');
    });

    it('should return null when event context is missing', () => {
      const event = makeEvent({ context: undefined as never });
      const result = service.toCompleteSseEventFromObservability(event);
      expect(result).toBeNull();
    });

    it('should include the ExecutionContext in complete event', () => {
      const event = makeEvent();
      const result = service.toCompleteSseEventFromObservability(event);

      expect(result!.data.context).toEqual(mockContext);
    });

    it('should default mode to "converse" when payload.mode not set', () => {
      const event = makeEvent({ payload: {} });
      const result = service.toCompleteSseEventFromObservability(event);

      expect(result!.data.mode).toBe('converse');
    });
  });

  describe('toErrorSseEventFromObservability', () => {
    it('should build an error SSE event', () => {
      const event = makeEvent({
        hook_event_type: 'agent.failed',
        message: 'Something broke',
      });
      const result = service.toErrorSseEventFromObservability(event);

      expect(result).not.toBeNull();
      expect(result!.event).toBe('agent_stream_error');
      expect(result!.data.type).toBe('error');
    });

    it('should return null when event context is missing', () => {
      const event = makeEvent({ context: undefined as never });
      const result = service.toErrorSseEventFromObservability(event);
      expect(result).toBeNull();
    });

    it('should use event.message as error text', () => {
      const event = makeEvent({ message: 'Task execution failed' });
      const result = service.toErrorSseEventFromObservability(event);

      expect(result!.data.error).toBe('Task execution failed');
    });

    it('should fall back to payload.error when message is empty', () => {
      const event = makeEvent({
        message: '',
        payload: { error: 'Payload error text' },
      });
      const result = service.toErrorSseEventFromObservability(event);

      expect(result!.data.error).toBe('Payload error text');
    });

    it('should fall back to status then default message', () => {
      const event = makeEvent({
        message: '',
        payload: {},
        status: 'timeout',
      });
      const result = service.toErrorSseEventFromObservability(event);

      expect(result!.data.error).toBe('timeout');
    });
  });

  describe('writeSseEvent', () => {
    it('should write event and data lines to response', () => {
      const mockResponse = {
        write: jest.fn(),
      } as unknown as Response;

      service.writeSseEvent(mockResponse, {
        event: 'agent_stream_chunk',
        data: { test: 'payload' } as never,
      });

      expect(mockResponse.write).toHaveBeenCalledTimes(2);
      expect(mockResponse.write).toHaveBeenNthCalledWith(
        1,
        'event: agent_stream_chunk\n',
      );
      expect(mockResponse.write).toHaveBeenNthCalledWith(
        2,
        `data: ${JSON.stringify({ test: 'payload' })}\n\n`,
      );
    });
  });
});
