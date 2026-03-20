import { Test, TestingModule } from '@nestjs/testing';
import { FlowTaskEventsService, TaskEvent } from '../flow-task-events.service';

function makeEvent(overrides: Partial<TaskEvent> = {}): TaskEvent {
  return {
    taskId: 'task-uuid-001',
    eventType: 'status_update',
    status: 'running',
    message: 'Task is running',
    step: null,
    toolName: null,
    sessionId: null,
    sourceApp: 'forge',
    timestamp: Date.now(),
    payload: {},
    ...overrides,
  };
}

describe('FlowTaskEventsService', () => {
  let service: FlowTaskEventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FlowTaskEventsService],
    }).compile();

    service = module.get<FlowTaskEventsService>(FlowTaskEventsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // push() + getBufferedEvents()
  // ---------------------------------------------------------------------------

  describe('push() and getBufferedEvents()', () => {
    it('buffers a pushed event and returns it via getBufferedEvents()', () => {
      const event = makeEvent();
      service.push(event);

      const buffered = service.getBufferedEvents('task-uuid-001');
      expect(buffered).toHaveLength(1);
      expect(buffered[0]).toEqual(event);
    });

    it('accumulates multiple events in insertion order', () => {
      const e1 = makeEvent({ message: 'first' });
      const e2 = makeEvent({ message: 'second', status: 'completed' });
      service.push(e1);
      service.push(e2);

      const buffered = service.getBufferedEvents('task-uuid-001');
      expect(buffered).toHaveLength(2);
      expect(buffered[0]?.message).toBe('first');
      expect(buffered[1]?.message).toBe('second');
    });

    it('keeps buffers isolated per taskId', () => {
      service.push(makeEvent({ taskId: 'task-A' }));
      service.push(makeEvent({ taskId: 'task-B', status: 'completed' }));

      expect(service.getBufferedEvents('task-A')).toHaveLength(1);
      expect(service.getBufferedEvents('task-B')).toHaveLength(1);
    });

    it('caps buffer at 200 events per task, dropping oldest', () => {
      for (let i = 0; i < 210; i++) {
        service.push(makeEvent({ message: `event-${i}` }));
      }
      const buffered = service.getBufferedEvents('task-uuid-001');
      expect(buffered).toHaveLength(200);
      // Oldest events are dropped — most recent are retained
      expect(buffered[buffered.length - 1]?.message).toBe('event-209');
    });
  });

  // ---------------------------------------------------------------------------
  // getBufferedEvents() — empty state
  // ---------------------------------------------------------------------------

  describe('getBufferedEvents() with no events', () => {
    it('returns empty array for an unknown taskId', () => {
      const result = service.getBufferedEvents('non-existent-task');
      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // subscribe()
  // ---------------------------------------------------------------------------

  describe('subscribe()', () => {
    it('emits events for the subscribed task only', (done) => {
      const received: TaskEvent[] = [];
      const subscription = service.subscribe('task-uuid-001').subscribe((e) => {
        received.push(e);
        if (received.length === 2) {
          subscription.unsubscribe();
          expect(received[0]?.message).toBe('msg-1');
          expect(received[1]?.message).toBe('msg-2');
          done();
        }
      });

      service.push(makeEvent({ taskId: 'task-other', message: 'ignored' }));
      service.push(makeEvent({ taskId: 'task-uuid-001', message: 'msg-1' }));
      service.push(makeEvent({ taskId: 'task-uuid-001', message: 'msg-2' }));
    });
  });

  // ---------------------------------------------------------------------------
  // clearTask()
  // ---------------------------------------------------------------------------

  describe('clearTask()', () => {
    it('removes all buffered events for the given taskId', () => {
      service.push(makeEvent());
      expect(service.getBufferedEvents('task-uuid-001')).toHaveLength(1);

      service.clearTask('task-uuid-001');
      expect(service.getBufferedEvents('task-uuid-001')).toEqual([]);
    });

    it('does not affect buffers for other tasks', () => {
      service.push(makeEvent({ taskId: 'task-A' }));
      service.push(makeEvent({ taskId: 'task-B' }));

      service.clearTask('task-A');

      expect(service.getBufferedEvents('task-A')).toEqual([]);
      expect(service.getBufferedEvents('task-B')).toHaveLength(1);
    });
  });
});
