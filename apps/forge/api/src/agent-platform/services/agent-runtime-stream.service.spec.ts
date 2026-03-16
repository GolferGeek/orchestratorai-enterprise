import { EventEmitter2 } from '@nestjs/event-emitter';
import { AgentRuntimeStreamService } from './agent-runtime-stream.service';

describe('AgentRuntimeStreamService', () => {
  let eventEmitter: EventEmitter2;
  let service: AgentRuntimeStreamService;

  beforeEach(() => {
    eventEmitter = new EventEmitter2();
    service = new AgentRuntimeStreamService(eventEmitter);
  });

  it('emits start/chunk/complete events for a streaming session', () => {
    const events: string[] = [];
    const payloads: unknown[] = [];

    eventEmitter.on('agent.stream.start', (payload) => {
      events.push('start');
      payloads.push(payload);
    });
    eventEmitter.on('agent.stream.chunk', (payload) => {
      events.push('chunk');
      payloads.push(payload);
    });
    eventEmitter.on('agent.stream.complete', (payload) => {
      events.push('complete');
      payloads.push(payload);
    });

    const session = service.start(
      {
        conversationId: 'conv-1',
        sessionId: 'sess-1',
        orchestrationRunId: 'run-1',
        organizationSlug: 'acme',
        agentSlug: 'agent-1',
        mode: 'converse',
      },
      'stream-123',
    );

    session.publishChunk({ type: 'partial', content: 'hello' });
    session.complete();

    expect(events).toEqual(['start', 'chunk', 'complete']);
    expect(payloads[0]).toMatchObject({
      streamId: 'stream-123',
      conversationId: 'conv-1',
      agentSlug: 'agent-1',
    });
    expect(payloads[1]).toMatchObject({
      streamId: 'stream-123',
      chunk: { type: 'partial', content: 'hello' },
    });
    expect(payloads[2]).toMatchObject({
      streamId: 'stream-123',
    });
  });

  it('emits error event when session errors', () => {
    const errors: unknown[] = [];

    eventEmitter.on('agent.stream.error', (payload) => {
      errors.push(payload);
    });

    const session = service.start(
      {
        agentSlug: 'agent-1',
        mode: 'converse',
      },
      'stream-error',
    );

    session.error(new Error('boom'));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      streamId: 'stream-error',
      error: 'boom',
    });
  });
});
