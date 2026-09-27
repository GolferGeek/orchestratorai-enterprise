import type { AmbientDatabaseService, Trigger } from '../ambient-database/database.service';
import type { AmbientEventBusService } from '../event-bus/ambient-event-bus.service';
import type { StreamingService } from '../streaming/streaming.service';
import { CronAdapterService } from './cron-adapter.service';
import type { ListenerRegistryService } from './listener-registry.service';

const trigger = (overrides: Partial<Trigger> = {}) =>
  ({ id: 't1', name: 'weekly', org_slug: 'corporate', source_type: 'cron', enabled: true, source_config: { expression: '0 7 * * 1' }, ...overrides }) as Trigger;

function adapter() {
  return new CronAdapterService(
    { register: jest.fn(), activate: jest.fn(), deactivate: jest.fn(), recordFiring: jest.fn() } as unknown as ListenerRegistryService,
    {} as StreamingService,
    { emit: jest.fn() } as unknown as AmbientEventBusService,
    { getEnabledTriggersBySource: jest.fn(async () => []) } as unknown as AmbientDatabaseService,
  );
}

describe('cron adapter: live rescheduling', () => {
  it('schedules an enabled cron trigger, reschedules a change, and drops a disabled or deleted one', () => {
    const cron = adapter();
    cron.sync(trigger());
    expect(cron.scheduledTriggerIds()).toEqual(['t1']);
    cron.sync(trigger({ source_config: { expression: '0 8 * * 1' } }));
    expect(cron.scheduledTriggerIds()).toEqual(['t1']);
    cron.sync(trigger({ enabled: false }));
    expect(cron.scheduledTriggerIds()).toEqual([]);
    cron.sync(trigger());
    cron.unschedule('t1');
    expect(cron.scheduledTriggerIds()).toEqual([]);
    cron.sync(trigger({ source_type: 'database' }));
    expect(cron.scheduledTriggerIds()).toEqual([]);
    cron.onModuleDestroy();
  });

  it('refuses a cron trigger without an expression', () => {
    expect(() => adapter().sync(trigger({ source_config: {} }))).toThrow('requires source_config.expression');
  });
});
