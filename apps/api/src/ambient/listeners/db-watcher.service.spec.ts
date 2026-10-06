import type {
  DatabaseChangeHandler,
  DatabaseChangeStreamService,
} from '@orchestratorai/planes/database';
import { DbWatcherService } from './db-watcher.service';
import { ListenerRegistryService } from './listener-registry.service';
import { StreamingService } from '../streaming/streaming.service';
import { AmbientEventBusService } from '../event-bus/ambient-event-bus.service';
import { AmbientDatabaseService } from '../ambient-database/database.service';

function stream() {
  const handlers: DatabaseChangeHandler[] = [];
  const unsubscribe = jest.fn(async () => undefined);
  const service = {
    subscribe: jest.fn(async (_subscription, nextHandler: DatabaseChangeHandler) => {
      handlers.push(nextHandler);
      return unsubscribe;
    }),
    close: jest.fn(async () => undefined),
  } as DatabaseChangeStreamService;
  return { service, handlers, unsubscribe };
}

function setup(sourceConfigs: Array<Record<string, unknown>>) {
  const platform = stream();
  const business = stream();
  const registry = {
    register: jest.fn(),
    activate: jest.fn(),
    recordFiring: jest.fn(),
    deactivate: jest.fn(),
    listenersEnabled: true,
  } as unknown as ListenerRegistryService;
  const streaming = { emitListenerFired: jest.fn() } as unknown as StreamingService;
  const eventBus = { emit: jest.fn() } as unknown as AmbientEventBusService;
  const database = {
    getEnabledTriggersBySource: jest.fn(async () =>
      sourceConfigs.map((source_config, i) => ({
        id: `trigger-${i + 1}`,
        org_slug: 'org-a',
        name: `Trigger ${i + 1}`,
        source_config,
      })),
    ),
  } as unknown as AmbientDatabaseService;
  const service = new DbWatcherService(registry, streaming, eventBus, database, platform.service, business.service);
  return { service, platform, business, streaming, eventBus };
}

describe('DbWatcherService', () => {
  it('subscribes on the platform database and emits its changes', async () => {
    const { service, platform, business, streaming, eventBus } = setup([
      { connection: 'platform', schema: 'public', table: 'tasks', events: ['INSERT'] },
    ]);

    await service.onModuleInit();
    expect(platform.service.subscribe).toHaveBeenCalledWith(
      { schema: 'public', table: 'tasks', events: ['INSERT'] },
      expect.any(Function),
    );
    expect(business.service.subscribe).not.toHaveBeenCalled();

    platform.handlers[0]!({ schema: 'public', table: 'tasks', eventType: 'INSERT', new: { id: 't1' }, old: null });
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        orgSlug: 'org-a',
        sourceType: 'database',
        triggerId: 'trigger-1',
        payload: expect.objectContaining({ connection: 'platform', schema: 'public', table: 'tasks', eventType: 'INSERT' }),
      }),
    );
    expect(streaming.emitListenerFired).toHaveBeenCalledWith(
      'org-a',
      'db-watcher',
      'database:platform:public.tasks',
      expect.objectContaining({ connection: 'platform', eventType: 'INSERT' }),
    );

    await service.onModuleDestroy();
    expect(platform.unsubscribe).toHaveBeenCalled();
  });

  it('subscribes a company-database trigger on the company database', async () => {
    const { service, platform, business, eventBus } = setup([
      { connection: 'business', schema: 'public', table: 'orders', events: ['UPDATE'] },
    ]);

    await service.onModuleInit();
    expect(business.service.subscribe).toHaveBeenCalledWith(
      { schema: 'public', table: 'orders', events: ['UPDATE'] },
      expect.any(Function),
    );
    expect(platform.service.subscribe).not.toHaveBeenCalled();

    business.handlers[0]!({
      schema: 'public',
      table: 'orders',
      eventType: 'UPDATE',
      new: { id: 'o1', status: 'paid' },
      old: { id: 'o1', status: 'submitted' },
    });
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ connection: 'business', table: 'orders' }) }),
    );
  });

  it('refuses a trigger that does not name its database', async () => {
    const { service, platform, business } = setup([{ schema: 'public', table: 'orders' }]);
    await expect(service.onModuleInit()).rejects.toThrow(/must name its database in source_config.connection/);
    expect(platform.service.subscribe).not.toHaveBeenCalled();
    expect(business.service.subscribe).not.toHaveBeenCalled();
  });
});
