import { Test, TestingModule } from '@nestjs/testing';
import {
  ObservabilityService,
  LangGraphObservabilityEvent,
} from './observability.service';
import { ObservabilityEventsService } from '@orchestratorai/planes/observability';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

describe('ObservabilityService', () => {
  let service: ObservabilityService;
  let pushSpy: jest.Mock;

  beforeEach(async () => {
    pushSpy = jest.fn().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ObservabilityService,
        {
          provide: ObservabilityEventsService,
          useValue: { push: pushSpy },
        },
      ],
    }).compile();

    service = module.get(ObservabilityService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('emit forwards a record to ObservabilityEventsService.push', async () => {
    const ctx = createMockExecutionContext({
      conversationId: 'c1',
      agentSlug: 'a1',
      orgSlug: 'o1',
    });
    const event: LangGraphObservabilityEvent = {
      context: ctx,
      threadId: 't1',
      status: 'started',
      message: 'Workflow started',
    };

    await service.emit(event);

    expect(pushSpy).toHaveBeenCalledTimes(1);
    const record = pushSpy.mock.calls[0][0];
    expect(record.context).toBe(ctx);
    expect(record.hook_event_type).toBe('langgraph.started');
    expect(record.status).toBe('langgraph.started');
    expect(record.payload.data.threadId).toBe('t1');
  });

  it('emitStarted delegates to emit with started status', async () => {
    const ctx = createMockExecutionContext();
    await service.emitStarted(ctx, 'thread-x', 'go');
    expect(pushSpy).toHaveBeenCalled();
    expect(pushSpy.mock.calls[0][0].hook_event_type).toBe('langgraph.started');
  });

  it('emitCompleted delegates to emit with completed status', async () => {
    const ctx = createMockExecutionContext();
    await service.emitCompleted(ctx, 'thread-x', 'done');
    expect(pushSpy.mock.calls[0][0].hook_event_type).toBe('langgraph.completed');
  });

  it('logs a warning when push fails (non-blocking)', async () => {
    pushSpy.mockRejectedValueOnce(new Error('buffer unavailable'));
    const warnSpy = jest.spyOn(service['logger'], 'warn');

    await service.emit({
      context: createMockExecutionContext(),
      threadId: 't',
      status: 'failed',
      message: 'oops',
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to emit observability event'),
    );
  });
});
