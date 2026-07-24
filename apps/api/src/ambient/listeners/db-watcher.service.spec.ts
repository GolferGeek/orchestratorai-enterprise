import type {
  DatabaseChangeHandler,
  DatabaseChangeStreamService,
} from '@orchestratorai/planes/database';
import { DbWatcherService } from './db-watcher.service';
import { ListenerRegistryService } from './listener-registry.service';
import { StreamingService } from '../streaming/streaming.service';
import { AmbientEventBusService } from '../event-bus/ambient-event-bus.service';
import { AmbientDatabaseService } from '../ambient-database/database.service';

describe('DbWatcherService', () => {
  it('subscribes through the database change-stream plane and emits changes', async () => {
    let handler: DatabaseChangeHandler | undefined;
    const unsubscribe = jest.fn(async () => undefined);
    const changeStream = {
      subscribe: jest.fn(async (_subscription, nextHandler) => {
        handler = nextHandler;
        return unsubscribe;
      }),
      close: jest.fn(async () => undefined),
    } as DatabaseChangeStreamService;
    const registry = {
      register: jest.fn(),
      activate: jest.fn(),
      recordFiring: jest.fn(),
      deactivate: jest.fn(),
    } as unknown as ListenerRegistryService;
    const streaming = {
      emitListenerFired: jest.fn(),
    } as unknown as StreamingService;
    const eventBus = {
      emit: jest.fn(),
    } as unknown as AmbientEventBusService;
    const database = {
      getEnabledTriggersBySource: jest.fn(async () => [
        {
          id: 'trigger-1',
          name: 'Order changes',
          source_config: {
            schema: 'public',
            table: 'orders',
            events: ['INSERT'],
          },
        },
      ]),
    } as unknown as AmbientDatabaseService;
    const service = new DbWatcherService(
      registry,
      streaming,
      eventBus,
      database,
      changeStream,
    );

    await service.onModuleInit();
    expect(changeStream.subscribe).toHaveBeenCalledWith(
      {
        schema: 'public',
        table: 'orders',
        events: ['INSERT'],
      },
      expect.any(Function),
    );

    handler?.({
      schema: 'public',
      table: 'orders',
      eventType: 'INSERT',
      new: { id: 'order-1' },
      old: null,
    });

    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'database',
        triggerId: 'trigger-1',
        payload: expect.objectContaining({
          schema: 'public',
          table: 'orders',
          eventType: 'INSERT',
        }),
      }),
    );
    expect(streaming.emitListenerFired).toHaveBeenCalledWith(
      'db-watcher',
      'database:public.orders',
      expect.objectContaining({ eventType: 'INSERT' }),
    );

    await service.onModuleDestroy();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
