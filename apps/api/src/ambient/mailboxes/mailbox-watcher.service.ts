import { randomUUID } from 'node:crypto';
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';
import type { ExecutionContext, WorkflowDocumentRef } from '@orchestrator-ai/transport-types';
import { OrganizationCredentialsService } from '../../common/credentials/organization-credentials.service';
import {
  WORKFLOW_DOCUMENT_MAX_BYTES,
  WORKFLOW_DOCUMENT_MIME_TYPES,
  WORKFLOW_DOCUMENTS_BUCKET,
  WorkflowDocumentsService,
} from '../../workflows/shared/documents/workflow-documents.service';
import { AmbientDatabaseService } from '../ambient-database/database.service';
import { createSystemTriggeredContext } from '../automation-context/automation-context';
import { AmbientEventsService } from '../events/ambient-events.service';
import { ListenerRegistryService } from '../listeners/listener-registry.service';
import { GmailMailboxClient } from './gmail-mailbox.client';
import type { MailAttachment, MailboxClient, MailMessage } from './mailbox.types';
import { MailboxWatchesRepository, type MailboxWatch } from './mailbox-watches.repository';

/** Opens a watch's mailbox with the organization's credentials. A seam for specs. */
@Injectable()
export class MailboxClientFactory {
  constructor(private readonly credentials: OrganizationCredentialsService) {}

  async open(watch: MailboxWatch): Promise<MailboxClient> {
    const organizationSlug = watch.org_slug;
    const [clientId, clientSecret, refreshToken] = await Promise.all([
      this.credentials.get({ organizationSlug, type: 'google', key: 'client_id' }),
      this.credentials.get({ organizationSlug, type: 'google', key: 'client_secret' }),
      this.credentials.get({ organizationSlug, type: 'gmail', key: watch.credential_key }),
    ]);
    return new GmailMailboxClient({ clientId, clientSecret, refreshToken });
  }
}

export interface MailboxPollResult {
  found: number;
  raised: number;
  alreadySeen: number;
}

/** An attachment as the event carries it; text only when the watch reads it. */
export interface EventAttachment {
  bucket: string;
  path: string;
  filename: string;
  mimeType: string;
  text?: string | null;
  extractor?: string | null;
  confidence?: number | null;
  /** Why no text could be read (the message is still raised; the reader decides). */
  textError?: string;
}

/** The longest attachment text an event carries. */
export const MAX_ATTACHMENT_TEXT_CHARS = 200_000;

/** Types an attachment is often sent as, read from its extension instead. */
const BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

/** The type to store an attachment as: its own, or (for a generic one) its extension's. */
export function attachmentType(attachment: MailAttachment): string {
  if (attachment.mimeType !== 'application/octet-stream') return attachment.mimeType;
  return BY_EXTENSION[attachment.filename.split('.').pop()?.toLowerCase() ?? ''] ?? attachment.mimeType;
}

/**
 * Watch mode for mailboxes: polls each enabled watch on its schedule, reads
 * messages newer than its cursor (oldest first), stores their attachments as
 * documents, and pushes the watch's event once per message (the message id
 * is the dedupe key). Read-only: the mailbox is never changed.
 */
@Injectable()
export class MailboxWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailboxWatcherService.name);
  private readonly LISTENER_ID = 'mailbox-watcher';
  private readonly jobs = new Map<string, CronJob>();
  private readonly polling = new Set<string>();

  constructor(
    private readonly watches: MailboxWatchesRepository,
    private readonly clients: MailboxClientFactory,
    private readonly events: AmbientEventsService,
    private readonly ambient: AmbientDatabaseService,
    private readonly documents: WorkflowDocumentsService,
    private readonly registry: ListenerRegistryService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.registry.listenersEnabled) {
      this.logger.log('Mailbox watcher off (AMBIENT_LISTENERS_ENABLED=false)');
      return;
    }
    this.registry.register(this.LISTENER_ID, 'mailbox-watcher', 'Mailbox watcher');
    this.registry.activate(this.LISTENER_ID);
    for (const watch of await this.watches.listEnabled()) this.schedule(watch);
    this.logger.log(`Mailbox watcher scheduled ${this.jobs.size} watch(es)`);
  }

  onModuleDestroy(): void {
    for (const job of this.jobs.values()) job.stop();
    this.jobs.clear();
  }

  /** Bring a watch's job in line with the watch (after create or delete). */
  sync(watch: MailboxWatch | null, id: string): void {
    this.jobs.get(id)?.stop();
    this.jobs.delete(id);
    if (watch?.enabled && this.registry.listenersEnabled) this.schedule(watch);
  }

  private schedule(watch: MailboxWatch): void {
    const job = new CronJob(watch.schedule, () => {
      this.poll(watch.id, watch.org_slug).catch((error: Error) =>
        this.logger.error(`Mailbox watch ${watch.mailbox} (${watch.id}) failed: ${error.message}`),
      );
    });
    job.start();
    this.jobs.set(watch.id, job);
  }

  /** Read the watch's mailbox now. A poll already running for it makes this a no-op. */
  async poll(id: string, orgSlug: string): Promise<MailboxPollResult | { skipped: string }> {
    if (this.polling.has(id)) return { skipped: 'a poll of this watch is already running' };
    this.polling.add(id);
    try {
      const watch = await this.watches.get(orgSlug, id);
      if (!watch) throw new Error(`Mailbox watch ${id} not found`);
      try {
        const result = await this.read(watch);
        await this.watches.recordPoll(id, null);
        this.registry.recordFiring(this.LISTENER_ID);
        return result;
      } catch (error) {
        await this.watches.recordPoll(id, (error as Error).message);
        throw error;
      }
    } finally {
      this.polling.delete(id);
    }
  }

  private async read(watch: MailboxWatch): Promise<MailboxPollResult> {
    const client = await this.clients.open(watch);
    const address = await client.address();
    if (address.toLowerCase() !== watch.mailbox.toLowerCase()) {
      throw new Error(`The credential gmail/${watch.credential_key} signs in as ${address}, not ${watch.mailbox}`);
    }
    const ids = await client.search(watch.query, new Date(watch.checked_after));
    const messages: MailMessage[] = [];
    for (const id of ids) messages.push(await client.message(id));
    messages.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());

    let raised = 0;
    let alreadySeen = 0;
    for (const message of messages) {
      const dedupeKey = `gmail:${watch.mailbox.toLowerCase()}:${message.id}`;
      if (await this.ambient.eventExists(watch.org_slug, watch.event, dedupeKey)) {
        alreadySeen++;
      } else {
        const { stored, skipped } = await this.storeAttachments(watch, client, message);
        const [first] = stored;
        await this.events.push(watch.org_slug, {
          name: watch.event,
          source: `mailbox:${watch.mailbox.toLowerCase()}`,
          dedupeKey,
          payload: {
            channel: 'mail',
            provider: watch.provider,
            mailbox: watch.mailbox,
            messageId: message.id,
            threadId: message.threadId,
            from: message.from,
            to: message.to,
            subject: message.subject,
            receivedAt: message.receivedAt.toISOString(),
            body: message.body,
            attachments: stored,
            skippedAttachments: skipped,
            // The first attachment as the event's file, for a trigger that takes it in (documentFromEvent).
            ...(first ? { bucket: first.bucket, path: first.path, filename: first.filename } : {}),
          },
        });
        raised++;
      }
      await this.watches.advance(watch.id, message.receivedAt);
    }
    if (raised > 0) this.logger.log(`Mailbox ${watch.mailbox}: ${raised} new message(s) raised ${watch.event}`);
    return { found: ids.length, raised, alreadySeen };
  }

  /**
   * An attachment's text through the extractors plane (vision for scans and
   * images). A file with no readable text is reported on the attachment, not
   * a failed poll: the cursor must not stick on one unreadable fax.
   */
  private async textOf(context: ExecutionContext, ref: WorkflowDocumentRef): Promise<Partial<EventAttachment>> {
    try {
      const { text, extractor, confidence } = await this.documents.extract(context, ref);
      const cut = text.length > MAX_ATTACHMENT_TEXT_CHARS ? `${text.slice(0, MAX_ATTACHMENT_TEXT_CHARS)}\n[cut: longer than ${MAX_ATTACHMENT_TEXT_CHARS} characters]` : text;
      return { text: cut, extractor, confidence };
    } catch (error) {
      this.logger.warn(`No text from ${ref.filename} (${context.orgSlug}): ${(error as Error).message}`);
      return { text: null, extractor: null, confidence: null, textError: (error as Error).message };
    }
  }

  /** Attachments a document may be (type and size), stored under a folder of their own; the rest listed with why. */
  private async storeAttachments(
    watch: MailboxWatch,
    client: MailboxClient,
    message: MailMessage,
  ): Promise<{ stored: EventAttachment[]; skipped: Array<{ filename: string; reason: string }> }> {
    const stored: EventAttachment[] = [];
    const skipped: Array<{ filename: string; reason: string }> = [];
    if (message.attachments.length === 0) return { stored, skipped };
    const context = createSystemTriggeredContext({
      orgSlug: watch.org_slug,
      agentSlug: 'mailbox-watcher',
      conversationId: randomUUID(),
      provider: this.config.getOrThrow<string>('DEFAULT_LLM_PROVIDER'),
      model: this.config.getOrThrow<string>('DEFAULT_LLM_MODEL'),
    });
    for (const attachment of message.attachments) {
      const mimetype = attachmentType(attachment);
      if (!WORKFLOW_DOCUMENT_MIME_TYPES.includes(mimetype)) {
        skipped.push({ filename: attachment.filename, reason: `${mimetype} is not a document type taken in` });
        continue;
      }
      if (attachment.size > WORKFLOW_DOCUMENT_MAX_BYTES) {
        skipped.push({ filename: attachment.filename, reason: 'larger than 25 MB' });
        continue;
      }
      const buffer = await client.attachment(message.id, attachment);
      const ref = await this.documents.store(context, { buffer, originalname: attachment.filename, mimetype, size: buffer.length });
      stored.push({
        bucket: WORKFLOW_DOCUMENTS_BUCKET,
        path: ref.ref,
        filename: ref.filename,
        mimeType: ref.mimeType,
        ...(watch.extract_text ? await this.textOf(context, ref) : {}),
      });
    }
    return { stored, skipped };
  }
}
