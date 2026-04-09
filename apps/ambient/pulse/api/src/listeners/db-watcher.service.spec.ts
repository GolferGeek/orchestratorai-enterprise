/**
 * DbWatcherService Tests
 *
 * Covers:
 *  - onModuleInit() — registers listener, obtains Supabase client via SupabaseService,
 *                     and subscribes to triggers
 *  - onModuleInit() — handles database errors loading triggers
 *  - onModuleDestroy() — removes all Realtime channels and deactivates the listener
 *  - onModuleDestroy() — safe when client was never assigned
 *  - Event handling — postgres_changes callback emits AmbientEvent and SSE firing event
 *  - Event handling — correct channel name and subscription config per trigger
 *  - simulateEvent() — emits AmbientEvent and SSE event directly (no Supabase required)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DbWatcherService } from './db-watcher.service';
import { ListenerRegistryService } from './listener-registry.service';
import { StreamingService } from '../streaming/streaming.service';
import { AmbientEventBusService } from '../event-bus/ambient-event-bus.service';
import { AmbientDatabaseService, Trigger } from '../ambient-database/database.service';
import { SupabaseService } from '@orchestratorai/planes/database';

// ─── Supabase Realtime Mock ──────────────────────────────────────────────────
//
// We build a reusable mock factory that captures the postgres_changes handler
// so test assertions can invoke it directly.

function buildSupabaseClientMock() {
  const removeChannelFn = jest.fn().mockResolvedValue(undefined);

  // Mutable bag written to by channel().on() so tests can retrieve the handler.
  const captured: {
    payloadHandler: ((p: Record<string, unknown>) => void) | null;
    subscribeConfig: Record<string, unknown> | null;
    channelName: string | null;
  } = { payloadHandler: null, subscribeConfig: null, channelName: null };

  const buildSubscribable = () => ({
    subscribe: jest.fn().mockImplementation((cb: (status: string) => void) => {
      cb('SUBSCRIBED');
      return {};
    }),
  });

  const onFn = jest.fn().mockImplementation(
    (
      _eventType: string,
      config: Record<string, unknown>,
      handler: (payload: Record<string, unknown>) => void,
    ) => {
      captured.subscribeConfig = config;
      captured.payloadHandler = handler;
      return buildSubscribable();
    },
  );

  const channelFn = jest.fn().mockImplementation((name: string) => {
    captured.channelName = name;
    return { on: onFn };
  });

  return {
    mockClient: {
      channel: channelFn,
      removeChannel: removeChannelFn,
    },
    captured,
    channelFn,
    removeChannelFn,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTrigger(overrides: Partial<Trigger> = {}): Trigger {
  return {
    id: 'trig-1',
    org_slug: 'test-org',
    name: 'Article Insert Watcher',
    description: null,
    source_type: 'database',
    enabled: true,
    source_config: { table: 'articles', schema: 'public', events: ['INSERT'] },
    condition: null,
    action_config: {
      agentSlug: 'article-processor',
      agentType: 'context',
    },
    cooldown_seconds: 0,
    max_fires_per_hour: null,
    last_fired_at: null,
    created_by: 'user-1',
    product: 'pulse',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DbWatcherService', () => {
  let service: DbWatcherService;
  let mockRegistry: jest.Mocked<Partial<ListenerRegistryService>>;
  let mockStreaming: jest.Mocked<Partial<StreamingService>>;
  let mockEventBus: jest.Mocked<Partial<AmbientEventBusService>>;
  let mockDatabase: jest.Mocked<Partial<AmbientDatabaseService>>;
  let mockSupabaseService: jest.Mocked<Partial<SupabaseService>>;
  let supabaseMocks: ReturnType<typeof buildSupabaseClientMock>;

  beforeEach(async () => {
    supabaseMocks = buildSupabaseClientMock();

    mockRegistry = {
      register: jest.fn(),
      activate: jest.fn(),
      deactivate: jest.fn(),
      recordFiring: jest.fn(),
    };

    mockStreaming = {
      emitListenerFired: jest.fn(),
    };

    mockEventBus = {
      emit: jest.fn(),
    };

    mockDatabase = {
      getTriggersByProductAndSource: jest.fn().mockResolvedValue([makeTrigger()]),
    };

    mockSupabaseService = {
      getServiceClient: jest.fn().mockReturnValue(supabaseMocks.mockClient),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        DbWatcherService,
        { provide: ListenerRegistryService, useValue: mockRegistry },
        { provide: StreamingService, useValue: mockStreaming },
        { provide: AmbientEventBusService, useValue: mockEventBus },
        { provide: AmbientDatabaseService, useValue: mockDatabase },
        { provide: SupabaseService, useValue: mockSupabaseService },
      ],
    }).compile();

    service = moduleRef.get<DbWatcherService>(DbWatcherService);
  });

  // ─── Instantiation ──────────────────────────────────────────────────────────

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── onModuleInit() ─────────────────────────────────────────────────────────

  describe('onModuleInit()', () => {
    it('registers and activates the listener in the registry', async () => {
      await service.onModuleInit();

      expect(mockRegistry.register).toHaveBeenCalledWith(
        'db-watcher-main',
        'db-watcher',
        'Supabase DB Watcher',
      );
      expect(mockRegistry.activate).toHaveBeenCalledWith('db-watcher-main');
    });

    it('obtains the Supabase service client via SupabaseService', async () => {
      await service.onModuleInit();

      expect(mockSupabaseService.getServiceClient).toHaveBeenCalledTimes(1);
    });

    it('loads database triggers for product=pulse, source=database', async () => {
      await service.onModuleInit();

      expect(mockDatabase.getTriggersByProductAndSource).toHaveBeenCalledWith(
        'pulse',
        'database',
      );
    });

    it('subscribes to a Realtime channel named after the trigger id', async () => {
      await service.onModuleInit();

      expect(supabaseMocks.channelFn).toHaveBeenCalledWith('pulse-db-trigger-trig-1');
    });

    it('uses trigger source_config values (table, schema) for the subscription', async () => {
      mockDatabase.getTriggersByProductAndSource = jest.fn().mockResolvedValue([
        makeTrigger({
          source_config: { table: 'orders', schema: 'sales', events: ['INSERT', 'UPDATE'] },
        }),
      ]);

      await service.onModuleInit();

      expect(supabaseMocks.captured.subscribeConfig).toMatchObject({ table: 'orders', schema: 'sales' });
    });

    it('defaults table to "*" and schema to "public" when source_config is empty', async () => {
      mockDatabase.getTriggersByProductAndSource = jest.fn().mockResolvedValue([
        makeTrigger({ source_config: {} }),
      ]);

      await service.onModuleInit();

      expect(supabaseMocks.captured.subscribeConfig).toMatchObject({ table: '*', schema: 'public' });
    });

    it('subscribes to multiple channels when multiple triggers are returned', async () => {
      mockDatabase.getTriggersByProductAndSource = jest.fn().mockResolvedValue([
        makeTrigger({ id: 'trig-1', source_config: { table: 'articles' } }),
        makeTrigger({ id: 'trig-2', source_config: { table: 'orders' } }),
      ]);

      await service.onModuleInit();

      expect(supabaseMocks.channelFn).toHaveBeenCalledTimes(2);
      expect(supabaseMocks.channelFn).toHaveBeenCalledWith('pulse-db-trigger-trig-1');
      expect(supabaseMocks.channelFn).toHaveBeenCalledWith('pulse-db-trigger-trig-2');
    });

    it('does not subscribe to any channels when no triggers are found', async () => {
      mockDatabase.getTriggersByProductAndSource = jest.fn().mockResolvedValue([]);

      await service.onModuleInit();

      expect(supabaseMocks.channelFn).not.toHaveBeenCalled();
    });

    it('handles a database error when loading triggers without throwing', async () => {
      mockDatabase.getTriggersByProductAndSource = jest
        .fn()
        .mockRejectedValue(new Error('DB connection refused'));

      await expect(service.onModuleInit()).resolves.not.toThrow();
      expect(supabaseMocks.channelFn).not.toHaveBeenCalled();
    });
  });

  // ─── onModuleDestroy() ───────────────────────────────────────────────────────

  describe('onModuleDestroy()', () => {
    it('deactivates the listener in the registry', async () => {
      await service.onModuleInit();
      service.onModuleDestroy();

      expect(mockRegistry.deactivate).toHaveBeenCalledWith('db-watcher-main');
    });

    it('removes the Realtime channel for each subscribed trigger', async () => {
      await service.onModuleInit();
      service.onModuleDestroy();

      expect(supabaseMocks.removeChannelFn).toHaveBeenCalledTimes(1);
    });

    it('removes one channel per trigger when multiple are subscribed', async () => {
      mockDatabase.getTriggersByProductAndSource = jest.fn().mockResolvedValue([
        makeTrigger({ id: 'trig-1' }),
        makeTrigger({ id: 'trig-2' }),
      ]);

      await service.onModuleInit();
      service.onModuleDestroy();

      expect(supabaseMocks.removeChannelFn).toHaveBeenCalledTimes(2);
    });

    it('does not throw when onModuleInit was never called', () => {
      // realtimeClient is null — destroy must not crash
      expect(() => service.onModuleDestroy()).not.toThrow();
      expect(mockRegistry.deactivate).toHaveBeenCalledWith('db-watcher-main');
    });
  });

  // ─── Realtime postgres_changes event handling ────────────────────────────────

  describe('postgres_changes event handling', () => {
    const insertPayload: Record<string, unknown> = {
      eventType: 'INSERT',
      new: { id: 'row-1', title: 'Breaking News' },
      old: {},
    };

    it('emits an AmbientEvent to the event bus when a change arrives', async () => {
      await service.onModuleInit();

      expect(supabaseMocks.captured.payloadHandler).not.toBeNull();
      supabaseMocks.captured.payloadHandler!(insertPayload);

      expect(mockEventBus.emit).toHaveBeenCalledTimes(1);
      const emitted = (mockEventBus.emit as jest.Mock).mock.calls[0]![0];
      expect(emitted.sourceType).toBe('database');
      expect(emitted.triggerId).toBe('trig-1');
      expect(emitted.triggerName).toBe('Article Insert Watcher');
      expect(emitted.payload.table).toBe('articles');
      expect(emitted.payload.schema).toBe('public');
      expect(emitted.payload.eventType).toBe('INSERT');
      expect(emitted.payload.new).toEqual({ id: 'row-1', title: 'Breaking News' });
      expect(emitted.timestamp).toBeDefined();
    });

    it('emits an SSE listener.fired event for the changed table', async () => {
      await service.onModuleInit();
      supabaseMocks.captured.payloadHandler!(insertPayload);

      expect(mockStreaming.emitListenerFired).toHaveBeenCalledTimes(1);
      expect(mockStreaming.emitListenerFired).toHaveBeenCalledWith(
        'db-watcher',
        'supabase:public.articles',
        expect.objectContaining({ table: 'articles', schema: 'public', eventType: 'INSERT' }),
      );
    });

    it('records a listener firing in the registry when a change arrives', async () => {
      await service.onModuleInit();
      supabaseMocks.captured.payloadHandler!(insertPayload);

      expect(mockRegistry.recordFiring).toHaveBeenCalledWith('db-watcher-main');
    });

    it('includes old and new row data in the emitted AmbientEvent payload', async () => {
      const updatePayload: Record<string, unknown> = {
        eventType: 'UPDATE',
        new: { id: 'row-1', title: 'Updated Title' },
        old: { id: 'row-1', title: 'Original Title' },
      };

      await service.onModuleInit();
      supabaseMocks.captured.payloadHandler!(updatePayload);

      const emitted = (mockEventBus.emit as jest.Mock).mock.calls[0]![0];
      expect(emitted.payload.new).toEqual({ id: 'row-1', title: 'Updated Title' });
      expect(emitted.payload.old).toEqual({ id: 'row-1', title: 'Original Title' });
    });
  });

  // ─── simulateEvent() ────────────────────────────────────────────────────────

  describe('simulateEvent()', () => {
    it('emits an AmbientEvent with sourceType=database', () => {
      service.simulateEvent('articles', 'INSERT', { id: 'row-99' });

      expect(mockEventBus.emit).toHaveBeenCalledTimes(1);
      const emitted = (mockEventBus.emit as jest.Mock).mock.calls[0]![0];
      expect(emitted.sourceType).toBe('database');
      expect(emitted.payload.table).toBe('articles');
      expect(emitted.payload.eventType).toBe('INSERT');
      expect(emitted.payload.data).toEqual({ id: 'row-99' });
      expect(emitted.timestamp).toBeDefined();
    });

    it('emits an SSE listener.fired event for the given table', () => {
      service.simulateEvent('orders', 'DELETE', { id: 'order-5' });

      expect(mockStreaming.emitListenerFired).toHaveBeenCalledWith(
        'db-watcher',
        'supabase:orders',
        expect.objectContaining({ table: 'orders', eventType: 'DELETE' }),
      );
    });

    it('records a listener firing in the registry', () => {
      service.simulateEvent('articles', 'UPDATE', {});

      expect(mockRegistry.recordFiring).toHaveBeenCalledWith('db-watcher-main');
    });

    it('works without the Supabase client being initialized', () => {
      // onModuleInit was not called — realtimeClient is null
      expect(() => service.simulateEvent('articles', 'INSERT', {})).not.toThrow();
      expect(mockEventBus.emit).toHaveBeenCalledTimes(1);
    });
  });
});
