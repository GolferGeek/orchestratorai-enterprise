/**
 * The storage watcher against the real ambient tables: a new object in a
 * watched folder pushes the watch's event once. Set
 * WORKFLOW_RUNS_TEST_DATABASE_URL to run it. Its rows are in the org
 * 'storage-spec' and removed after.
 */
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import { AmbientDatabaseService } from '../ambient-database/database.service';
import { AmbientEventBusService } from '../event-bus/ambient-event-bus.service';
import type { ListenerRegistryService } from '../listeners/listener-registry.service';
import type { StreamingService } from '../streaming/streaming.service';
import { AmbientEventsService } from './ambient-events.service';
import { StorageWatcherService } from './storage-watcher.service';

const url = process.env.WORKFLOW_RUNS_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;
const ORG = 'storage-spec';

describeWithDb('the storage watcher against Postgres', () => {
  let db: PostgresqlDatabaseService;
  let ambient: AmbientDatabaseService;
  let watcher: StorageWatcherService;
  const bucket = `spec-${randomUUID().slice(0, 8)}`;
  const registry = { register: jest.fn(), activate: jest.fn(), recordFiring: jest.fn(), deactivate: jest.fn(), listenersEnabled: true };

  const stored = (name: string, id = randomUUID()) =>
    watcher.objectStored({
      schema: 'storage', table: 'objects', eventType: 'INSERT',
      new: { id, bucket_id: bucket, name, metadata: { size: 10, mimetype: 'application/pdf' }, created_at: '2026-09-28T12:00:00Z' },
      old: null,
    } as never);
  const eventsNamed = async (name: string) => (await ambient.listEvents(ORG, 100)).filter((e) => e.name === name);

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    ambient = new AmbientDatabaseService(db);
    const events = new AmbientEventsService(ambient, new AmbientEventBusService(), { emitListenerFired: jest.fn() } as unknown as StreamingService, registry as unknown as ListenerRegistryService);
    watcher = new StorageWatcherService(registry as unknown as ListenerRegistryService, ambient, events, {} as never);
    await ambient.createStorageWatch({ org_slug: ORG, bucket, prefix: 'invoices/', event: 'spec.invoice-received', created_by: null });
  });

  afterAll(async () => {
    await db.rawQuery(`DELETE FROM ambient.storage_watches WHERE org_slug = $1`, [ORG]);
    await db.rawQuery(`DELETE FROM ambient.events WHERE org_slug = $1`, [ORG]);

    await db.onModuleDestroy();
  });

  it('pushes the watch\'s event for a file in its folder, once per file', async () => {
    const id = randomUUID();
    await stored('invoices/INV-7.pdf', id);
    await stored('invoices/INV-7.pdf', id);
    await stored('receipts/R-1.pdf');
    await stored('invoices/.emptyFolderPlaceholder');
    const events = await eventsNamed('spec.invoice-received');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: `storage:${bucket}/invoices/`,
      dedupe_key: `storage:${id}`,
      origin: null,
      payload: { bucket, path: 'invoices/INV-7.pdf', filename: 'INV-7.pdf', objectId: id, size: 10, mimeType: 'application/pdf' },
    });
  });

  it('refuses a change that is not a stored object', async () => {
    await expect(watcher.objectStored({ schema: 'storage', table: 'objects', eventType: 'INSERT', new: {}, old: null } as never)).rejects.toThrow('bucket_id and name');
  });
});
