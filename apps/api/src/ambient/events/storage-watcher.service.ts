import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  DATABASE_CHANGE_STREAM_SERVICE,
  type DatabaseChangeEvent,
  type DatabaseChangeStreamService,
} from '@orchestratorai/planes/database';
import { AmbientDatabaseService, StorageWatch } from '../ambient-database/database.service';
import { ListenerRegistryService } from '../listeners/listener-registry.service';
import { AmbientEventsService } from './ambient-events.service';

/** The storage.objects columns the watcher reads. */
export interface StoredObject {
  id: string;
  bucket_id: string;
  name: string;
  metadata: { size?: number; mimetype?: string } | null;
  created_at: string;
}

/** Supabase writes one of these when a folder is created in its dashboard; it is not a file. */
const FOLDER_PLACEHOLDER = '.emptyFolderPlaceholder';

/** The watches a new object falls under: its bucket, and a path under the watch's folder. */
export function watchesFor(object: StoredObject, watches: StorageWatch[]): StorageWatch[] {
  if (object.name.endsWith(`/${FOLDER_PLACEHOLDER}`) || object.name === FOLDER_PLACEHOLDER) return [];
  return watches.filter((watch) => watch.enabled && watch.bucket === object.bucket_id && object.name.startsWith(watch.prefix));
}

/**
 * What the raised event carries about the file (never its contents). The
 * folders of its path are there for triggers to read from, e.g.
 * invoices/PO-4502/INV-7.pdf gives folders ['invoices', 'PO-4502'].
 */
export function storageEventPayload(object: StoredObject): Record<string, unknown> {
  const segments = object.name.split('/');
  const filename = segments.pop()!;
  return {
    channel: 'storage',
    bucket: object.bucket_id,
    path: object.name,
    filename,
    folders: segments,
    objectId: object.id,
    ...(typeof object.metadata?.size === 'number' ? { size: object.metadata.size } : {}),
    ...(typeof object.metadata?.mimetype === 'string' ? { mimeType: object.metadata.mimetype } : {}),
    uploadedAt: object.created_at,
  };
}

/**
 * Watch mode for storage: a file that lands in a watched folder
 * (ambient.storage_watches) raises that watch's named event, pushed like any
 * other, so the triggers on that event answer a bucket drop and an A2A push
 * alike. Follows storage.objects inserts through the database change stream;
 * the object's id is the dedupe key, so one file raises one event per watch.
 */
@Injectable()
export class StorageWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StorageWatcherService.name);
  private readonly LISTENER_ID = 'storage-watcher';
  private unsubscribe: (() => Promise<void>) | null = null;

  constructor(
    private readonly registry: ListenerRegistryService,
    private readonly database: AmbientDatabaseService,
    private readonly events: AmbientEventsService,
    @Inject(DATABASE_CHANGE_STREAM_SERVICE) private readonly changeStream: DatabaseChangeStreamService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.registry.listenersEnabled) {
      this.logger.log('Storage watcher off (AMBIENT_LISTENERS_ENABLED=false)');
      return;
    }
    this.registry.register(this.LISTENER_ID, 'storage-watcher', 'Storage folders');
    this.unsubscribe = await this.changeStream.subscribe(
      { schema: 'storage', table: 'objects', events: ['INSERT'] },
      (change) => {
        this.objectStored(change).catch((error: Error) =>
          this.logger.error(`Storage event for ${String(change.new?.name)} failed: ${error.message}`),
        );
      },
    );
    this.registry.activate(this.LISTENER_ID);
    this.logger.log('Storage watcher following storage.objects');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.unsubscribe) await this.unsubscribe();
    this.registry.deactivate(this.LISTENER_ID);
  }

  /** A new object: raise the event of every watch it falls under. */
  async objectStored(change: DatabaseChangeEvent): Promise<void> {
    const object = change.new as unknown as StoredObject | null;
    if (!object || typeof object.bucket_id !== 'string' || typeof object.name !== 'string') {
      throw new Error('A storage.objects insert arrived without bucket_id and name');
    }
    const matching = watchesFor(object, await this.database.getEnabledStorageWatches(object.bucket_id));
    for (const watch of matching) {
      this.registry.recordFiring(this.LISTENER_ID);
      await this.events.push(watch.org_slug, {
        name: watch.event,
        payload: storageEventPayload(object),
        source: `storage:${watch.bucket}/${watch.prefix}`,
        dedupeKey: `storage:${object.id}`,
      });
    }
  }
}
