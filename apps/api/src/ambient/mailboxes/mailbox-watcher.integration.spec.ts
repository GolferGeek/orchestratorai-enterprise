/**
 * A watched mailbox end to end against the real tables, with a fake mailbox:
 * new messages raise the watch's event once each (oldest first), with the
 * message and its taken-in attachments; a second poll raises nothing; the
 * cursor moves; a credential signed in as another address is refused and
 * recorded on the watch.
 *
 * Set WORKFLOW_RUNS_TEST_DATABASE_URL to run it (skipped otherwise).
 */
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PostgresqlDatabaseService } from '@orchestratorai/planes/database/postgresql-database.service';
import type { WorkflowDocumentsService } from '../../workflows/shared/documents/workflow-documents.service';
import { AmbientDatabaseService } from '../ambient-database/database.service';
import type { AmbientEventBusService } from '../event-bus/ambient-event-bus.service';
import { AmbientEventsService } from '../events/ambient-events.service';
import type { ListenerRegistryService } from '../listeners/listener-registry.service';
import type { StreamingService } from '../streaming/streaming.service';
import type { MailboxClient, MailMessage } from './mailbox.types';
import { MailboxWatcherService, type MailboxClientFactory } from './mailbox-watcher.service';
import { MailboxWatchesRepository } from './mailbox-watches.repository';

const url = process.env.WORKFLOW_RUNS_TEST_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

describeWithDb('a watched mailbox against Postgres', () => {
  const org = 'marketing';
  const event = `it.mail-${randomUUID().slice(0, 8)}`;
  let db: PostgresqlDatabaseService;
  let watches: MailboxWatchesRepository;
  let watcher: MailboxWatcherService;
  let address = 'order@acme.example';
  const emitted: Array<{ payload: Record<string, unknown> }> = [];
  const stored: string[] = [];

  const messages: MailMessage[] = [
    {
      id: 'm2', threadId: 't2', from: 'b@lab.example', to: 'order@acme.example', subject: 'Second', body: 'Two',
      receivedAt: new Date(Date.now() - 60_000), attachments: [],
    },
    {
      id: 'm1', threadId: 't1', from: 'Lab Buyer <buyer@lab.example>', to: 'order@acme.example', subject: 'PO 4502', body: 'Please ship.',
      receivedAt: new Date(Date.now() - 120_000),
      attachments: [
        { id: 'a1', filename: 'PO-4502.pdf', mimeType: 'application/octet-stream', size: 4 },
        { id: 'a2', filename: 'labels.zip', mimeType: 'application/zip', size: 4 },
        { id: 'a3', filename: 'fax.png', mimeType: 'image/png', size: 4 },
      ],
    },
  ];
  const mailbox: MailboxClient = {
    address: async () => address,
    search: async () => messages.map((m) => m.id),
    message: async (id) => messages.find((m) => m.id === id)!,
    attachment: async () => Buffer.from('%PDF'),
  };

  beforeAll(async () => {
    db = new PostgresqlDatabaseService(new ConfigService({ POSTGRESQL_URL: url }));
    watches = new MailboxWatchesRepository(db);
    const ambient = new AmbientDatabaseService(db);
    const registry = { listenersEnabled: false, register: jest.fn(), activate: jest.fn(), recordFiring: jest.fn() } as unknown as ListenerRegistryService;
    const bus = { emit: jest.fn((e: { payload: Record<string, unknown> }) => emitted.push(e)) } as unknown as AmbientEventBusService;
    const streaming = { emitListenerFired: jest.fn() } as unknown as StreamingService;
    const documents = {
      store: jest.fn(async (context: { orgSlug: string; conversationId: string }, file: { originalname: string; mimetype: string }) => {
        const ref = `${context.orgSlug}/${context.conversationId}/${randomUUID()}-${file.originalname}`;
        stored.push(`${file.originalname} ${file.mimetype}`);
        return { ref, filename: file.originalname, mimeType: file.mimetype };
      }),
      extract: jest.fn(async (_context: unknown, doc: { filename: string }) => {
        if (doc.filename === 'fax.png') throw new Error('No text could be read from fax.png');
        return { text: 'PO 4502: 2 x anti-GFAP', extractor: 'pdf', confidence: null };
      }),
    } as unknown as WorkflowDocumentsService;
    watcher = new MailboxWatcherService(
      watches,
      { open: async () => mailbox } as unknown as MailboxClientFactory,
      new AmbientEventsService(ambient, bus, streaming, registry),
      ambient,
      documents,
      registry,
      new ConfigService({ DEFAULT_LLM_PROVIDER: 'openrouter', DEFAULT_LLM_MODEL: 'm' }),
    );
  });

  afterAll(async () => {
    await db.rawQuery(`DELETE FROM ambient.events WHERE org_slug = $1 AND name = $2`, [org, event]);
    await db.rawQuery(`DELETE FROM ambient.mailbox_watches WHERE event = $1`, [event]);
    await db.onModuleDestroy();
  });

  it('raises one event per new message, oldest first, then nothing on the next poll', async () => {
    const watch = await watches.create({
      org_slug: org, provider: 'gmail', mailbox: 'Order@acme.example', credential_key: 'order-mailbox',
      query: 'in:inbox', schedule: '*/5 * * * *', event, extract_text: true, created_by: null,
    });
    await db.rawQuery(`UPDATE ambient.mailbox_watches SET checked_after = now() - interval '1 hour' WHERE id = $1`, [watch.id]);

    expect(await watcher.poll(watch.id, org)).toEqual({ found: 2, raised: 2, alreadySeen: 0 });
    expect(emitted.map((e) => e.payload.messageId)).toEqual(['m1', 'm2']);
    const first = emitted[0]!.payload;
    expect(first).toMatchObject({
      channel: 'mail', provider: 'gmail', mailbox: 'Order@acme.example', from: 'Lab Buyer <buyer@lab.example>',
      subject: 'PO 4502', body: 'Please ship.', bucket: 'workflow-documents', filename: 'PO-4502.pdf',
      skippedAttachments: [{ filename: 'labels.zip', reason: 'application/zip is not a document type taken in' }],
    });
    expect(stored).toEqual(['PO-4502.pdf application/pdf', 'fax.png image/png']);
    // The watch reads attachment text; one that cannot be read says why, and the message is still raised.
    expect(first.attachments).toEqual([
      expect.objectContaining({ filename: 'PO-4502.pdf', text: 'PO 4502: 2 x anti-GFAP', extractor: 'pdf', confidence: null }),
      expect.objectContaining({ filename: 'fax.png', text: null, textError: 'No text could be read from fax.png' }),
    ]);

    expect(await watcher.poll(watch.id, org)).toEqual({ found: 2, raised: 0, alreadySeen: 2 });
    expect(emitted).toHaveLength(2);
    const after = await watches.get(org, watch.id);
    expect(new Date(after!.checked_after).getTime()).toBe(messages[0]!.receivedAt.getTime());
    expect(after).toMatchObject({ last_error: null, last_polled_at: expect.any(String) });
  });

  it('refuses a credential signed in as another mailbox, and records why', async () => {
    const [watch] = (await watches.list(org)).filter((w) => w.event === event);
    address = 'someone-else@acme.example';
    await expect(watcher.poll(watch!.id, org)).rejects.toThrow('signs in as someone-else@acme.example, not Order@acme.example');
    expect((await watches.get(org, watch!.id))!.last_error).toContain('signs in as someone-else@acme.example');
    address = 'order@acme.example';
  });
});
