/**
 * Push mode against the real ambient tables: an event is stored, a duplicate
 * key is one event, and a trigger on the event's name fires or skips with the
 * event id recorded on its execution. Set WORKFLOW_RUNS_TEST_DATABASE_URL to
 * run it. Everything it writes is in the org 'ambient-spec' and removed after.
 */
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import { AmbientDatabaseService, Trigger } from '../ambient-database/database.service';
import { AmbientEventBusService } from '../event-bus/ambient-event-bus.service';
import type { AmbientEvent } from '../event-bus/ambient-event.types';
import type { ListenerRegistryService } from '../listeners/listener-registry.service';
import type { StreamingService } from '../streaming/streaming.service';
import { TriggerEvaluatorService } from '../services/trigger-evaluator.service';
import type { TriggerExecutorService } from '../services/trigger-executor.service';
import { AmbientEventsService } from './ambient-events.service';

const url = process.env.WORKFLOW_RUNS_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;
const ORG = 'ambient-spec';

describeWithDb('ambient push mode against Postgres', () => {
  const eventName = `spec.pushed-${randomUUID().slice(0, 8)}`;
  let db: PostgresqlDatabaseService;
  let ambientDb: AmbientDatabaseService;
  let events: AmbientEventsService;
  let evaluator: TriggerEvaluatorService;
  let trigger: Trigger;
  const emitted: AmbientEvent[] = [];
  const fired: AmbientEvent[] = [];

  const sql = async (text: string, params: unknown[] = []) => {
    const { data, error } = await db.rawQuery(text, params);
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>[];
  };
  const executionsFor = async (eventId: string, count: number) => {
    for (let i = 0; i < 50; i += 1) {
      const rows = await ambientDb.getExecutionsForEvent(eventId);
      if (rows.length >= count) return rows;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`No ${count} execution(s) recorded for event ${eventId}`);
  };

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    ambientDb = new AmbientDatabaseService(db);
    const bus = new AmbientEventBusService();
    bus.events$.subscribe((event) => emitted.push(event));
    const registry = { register: jest.fn(), activate: jest.fn(), recordFiring: jest.fn() } as unknown as ListenerRegistryService;
    const streaming = { emitListenerFired: jest.fn() } as unknown as StreamingService;
    const executor = { execute: jest.fn(async (_t: Trigger, e: AmbientEvent) => { fired.push(e); }) } as unknown as TriggerExecutorService;
    events = new AmbientEventsService(ambientDb, bus, streaming, registry);
    evaluator = new TriggerEvaluatorService(bus, ambientDb, executor);
    evaluator.onModuleInit();
    trigger = await ambientDb.createTrigger({
      org_slug: ORG,
      name: 'Spec: pushed event',
      description: null,
      source_type: 'event',
      enabled: true,
      source_config: { event: eventName },
      condition: { kind: 'invoice' },
      action_config: { agentSlug: 'spec-agent' },
      trigger_kind: 'event',
      trigger_config: { event: eventName },
      response_kind: 'capability',
      response_config: { agentSlug: 'spec-agent' },
      cooldown_seconds: 0,
      max_fires_per_hour: null,
      created_by: null,
    });
  });

  afterAll(async () => {
    evaluator.onModuleDestroy();
    await sql(`DELETE FROM ambient.triggers WHERE org_slug = $1`, [ORG]);
    await sql(`DELETE FROM ambient.events WHERE org_slug = $1`, [ORG]);
  });

  it('stores the event, emits it with its id, and a matching trigger fires with it', async () => {
    const { event, duplicate } = await events.push(ORG, { name: eventName, payload: { kind: 'invoice', n: 1 }, source: 'spec' });
    expect(duplicate).toBe(false);
    expect(await ambientDb.getEvent(event.id, ORG)).toMatchObject({ name: eventName, source: 'spec', payload: { kind: 'invoice', n: 1 } });
    expect(await ambientDb.getEvent(event.id, 'finance')).toBeNull();
    expect(emitted.at(-1)).toMatchObject({ sourceType: 'event', pushed: { id: event.id, name: eventName } });

    for (let i = 0; i < 50 && !fired.some((e) => e.pushed?.id === event.id); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(fired.find((e) => e.pushed?.id === event.id)?.payload).toEqual({ kind: 'invoice', n: 1 });
  });

  it('records a skip against the event when the condition does not hold', async () => {
    const { event } = await events.push(ORG, { name: eventName, payload: { kind: 'receipt' }, source: 'spec' });
    const [execution] = await executionsFor(event.id, 1);
    expect(execution).toMatchObject({ trigger_id: trigger.id, status: 'skipped', skip_reason: 'condition_not_met', event_id: event.id });
  });

  it('treats the same dedupe key as one event and emits it once', async () => {
    const key = `INV-${randomUUID()}`;
    const first = await events.push(ORG, { name: eventName, payload: { kind: 'invoice' }, source: 'spec', dedupeKey: key });
    const before = emitted.length;
    const second = await events.push(ORG, { name: eventName, payload: { kind: 'invoice', changed: true }, source: 'spec', dedupeKey: key });
    expect(second).toMatchObject({ duplicate: true, event: { id: first.event.id, payload: { kind: 'invoice' } } });
    expect(emitted.length).toBe(before);
    const other = await events.push(ORG, { name: `${eventName}-other`, payload: {}, source: 'spec', dedupeKey: key });
    expect(other.duplicate).toBe(false);
  });

  it('refuses a bad name or no single org before storing anything', async () => {
    await expect(events.push(ORG, { name: 'Bad Name', payload: {}, source: 'spec' })).rejects.toThrow('lowercase');
    await expect(events.push('*', { name: eventName, payload: {}, source: 'spec' })).rejects.toThrow('one organization');
  });
});
