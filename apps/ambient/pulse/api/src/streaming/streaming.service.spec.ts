import { Test, TestingModule } from '@nestjs/testing';
import { StreamingService, PulseEvent } from './streaming.service';
import { firstValueFrom, take } from 'rxjs';

describe('StreamingService', () => {
  let service: StreamingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StreamingService],
    }).compile();

    service = module.get<StreamingService>(StreamingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should expose an events$ observable', () => {
    expect(service.events$).toBeDefined();
    expect(typeof service.events$.subscribe).toBe('function');
  });

  describe('emit()', () => {
    it('should add a timestamp to the event', (done) => {
      service.events$.pipe(take(1)).subscribe((event) => {
        expect(event.timestamp).toBeDefined();
        expect(new Date(event.timestamp).getTime()).toBeGreaterThan(0);
        done();
      });

      service.emit({ type: 'listener.fired', data: {} });
    });

    it('should broadcast the event to all subscribers', (done) => {
      const received: PulseEvent[] = [];

      service.events$.subscribe((e) => received.push(e));

      service.emit({ type: 'heartbeat', data: {} });

      // Allow microtask queue to flush
      setImmediate(() => {
        expect(received.length).toBe(1);
        expect(received[0]!.type).toBe('heartbeat');
        done();
      });
    });
  });

  describe('emitWorkflowTriggered()', () => {
    it('should emit a workflow.triggered event with workflowId and trigger', async () => {
      const promise = firstValueFrom(service.events$.pipe(take(1)));
      service.emitWorkflowTriggered('wf-123', 'db-change', { table: 'users' });
      const event = await promise;

      expect(event.type).toBe('workflow.triggered');
      expect(event.data['workflowId']).toBe('wf-123');
      expect(event.data['trigger']).toBe('db-change');
      expect(event.data['table']).toBe('users');
    });
  });

  describe('emitWorkflowCompleted()', () => {
    it('should emit a workflow.completed event', async () => {
      const promise = firstValueFrom(service.events$.pipe(take(1)));
      const outcome = { steps: {}, completedAt: new Date().toISOString() };
      service.emitWorkflowCompleted('wf-456', outcome);
      const event = await promise;

      expect(event.type).toBe('workflow.completed');
      expect(event.data['workflowId']).toBe('wf-456');
      expect(event.data['outcome']).toEqual(outcome);
    });
  });

  describe('emitWorkflowFailed()', () => {
    it('should emit a workflow.failed event with error message', async () => {
      const promise = firstValueFrom(service.events$.pipe(take(1)));
      service.emitWorkflowFailed('wf-789', 'Step 2 threw');
      const event = await promise;

      expect(event.type).toBe('workflow.failed');
      expect(event.data['workflowId']).toBe('wf-789');
      expect(event.data['error']).toBe('Step 2 threw');
    });
  });

  describe('emitListenerFired()', () => {
    it('should emit a listener.fired event with listenerType and source', async () => {
      const promise = firstValueFrom(service.events$.pipe(take(1)));
      service.emitListenerFired('db-watcher', 'supabase:orders', {
        table: 'orders',
        eventType: 'INSERT',
      });
      const event = await promise;

      expect(event.type).toBe('listener.fired');
      expect(event.data['listenerType']).toBe('db-watcher');
      expect(event.data['source']).toBe('supabase:orders');
      expect(event.data['table']).toBe('orders');
      expect(event.data['eventType']).toBe('INSERT');
    });
  });
});
