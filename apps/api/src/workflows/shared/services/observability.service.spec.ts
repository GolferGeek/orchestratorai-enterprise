import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { ObservabilityService } from './observability.service';

describe('Workflow ObservabilityService', () => {
  const events = { push: jest.fn() };
  let service: ObservabilityService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ObservabilityService(events as never);
  });

  it('passes the ExecutionContext capsule unchanged', async () => {
    const context = Object.freeze(createMockExecutionContext());
    events.push.mockResolvedValue(undefined);

    await service.emitStarted(context, 'thread-1', 'started');

    expect(events.push).toHaveBeenCalledWith(
      expect.objectContaining({ context, hook_event_type: 'langgraph.started' }),
    );
  });

  it('propagates observability failures instead of diverging silently', async () => {
    events.push.mockRejectedValue(new Error('event persistence failed'));

    await expect(
      service.emitStarted(createMockExecutionContext(), 'thread-1'),
    ).rejects.toThrow('event persistence failed');
  });
});
