import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as chokidar from 'chokidar';
import { ListenerRegistryService } from './listener-registry.service';
import { StreamingService } from '../streaming/streaming.service';
import { AmbientEventBusService } from '../event-bus/ambient-event-bus.service';
import { AmbientDatabaseService, Trigger } from '../ambient-database/database.service';

/**
 * File system watcher — uses chokidar to watch configured paths.
 *
 * On init:
 *   1. Loads active 'filesystem' triggers for product='pulse' from ambient.triggers
 *   2. Creates a chokidar watcher per trigger watching the configured path
 *   3. Emits AmbientEvents to the event bus on add/change/unlink
 *
 * simulateEvent() remains available for development/demo use.
 */
@Injectable()
export class FileWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FileWatcherService.name);
  private readonly LISTENER_ID = 'file-watcher-main';
  private readonly watchers = new Map<string, chokidar.FSWatcher>();

  constructor(
    private readonly registry: ListenerRegistryService,
    private readonly streaming: StreamingService,
    private readonly eventBus: AmbientEventBusService,
    private readonly database: AmbientDatabaseService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registry.register(this.LISTENER_ID, 'file-watcher', 'File System Watcher');
    this.registry.activate(this.LISTENER_ID);
    this.logger.log('File Watcher initialized — loading triggers from database');

    let triggers: Trigger[] = [];
    try {
      triggers = await this.database.getTriggersByProductAndSource('pulse', 'filesystem');
    } catch (err) {
      this.logger.error(`Failed to load filesystem triggers: ${(err as Error).message}`);
      return;
    }

    if (triggers.length === 0) {
      this.logger.log('No active filesystem triggers found for product=pulse');
      return;
    }

    for (const trigger of triggers) {
      this.watchTrigger(trigger);
    }

    this.logger.log(`File Watcher monitoring ${triggers.length} path(s)`);
  }

  onModuleDestroy(): void {
    for (const [triggerId, watcher] of this.watchers.entries()) {
      watcher.close().catch((err: Error) => {
        this.logger.warn(`Failed to close watcher for trigger ${triggerId}: ${err.message}`);
      });
    }
    this.watchers.clear();
    this.registry.deactivate(this.LISTENER_ID);
    this.logger.log('File Watcher stopped — all watchers closed');
  }

  private watchTrigger(trigger: Trigger): void {
    const config = trigger.source_config as {
      path?: string;
      ignored?: string | string[];
      persistent?: boolean;
      depth?: number;
    };

    const watchPath = config.path;
    if (!watchPath) {
      this.logger.warn(
        `Trigger "${trigger.name}" (${trigger.id}) has no path in source_config — skipping`,
      );
      return;
    }

    this.logger.log(`Watching path "${watchPath}" for trigger "${trigger.name}"`);

    const watcher = chokidar.watch(watchPath, {
      ignored: config.ignored,
      persistent: config.persistent ?? true,
      depth: config.depth,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    watcher
      .on('add', (filePath) => {
        this.handleFileEvent(trigger, 'created', filePath);
      })
      .on('change', (filePath) => {
        this.handleFileEvent(trigger, 'modified', filePath);
      })
      .on('unlink', (filePath) => {
        this.handleFileEvent(trigger, 'deleted', filePath);
      })
      .on('error', (error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(`File watcher error for trigger "${trigger.name}": ${err.message}`);
      });

    this.watchers.set(trigger.id, watcher);
  }

  private handleFileEvent(
    trigger: Trigger,
    eventType: 'created' | 'modified' | 'deleted',
    filePath: string,
  ): void {
    this.registry.recordFiring(this.LISTENER_ID);
    this.logger.log(`File event: ${eventType} at ${filePath} (trigger: ${trigger.name})`);

    this.eventBus.emit({
      sourceType: 'filesystem',
      triggerId: trigger.id,
      triggerName: trigger.name,
      payload: { path: filePath, eventType },
      timestamp: new Date().toISOString(),
    });

    this.streaming.emitListenerFired('file-watcher', filePath, {
      path: filePath,
      eventType,
    });
  }

  /**
   * Simulates a file system event for testing/demo purposes.
   * Emits directly to the event bus so the full evaluator pipeline runs.
   */
  simulateEvent(path: string, eventType: 'created' | 'modified' | 'deleted'): void {
    this.registry.recordFiring(this.LISTENER_ID);
    this.logger.log(`File event simulated: ${eventType} at ${path}`);

    this.eventBus.emit({
      sourceType: 'filesystem',
      payload: { path, eventType },
      timestamp: new Date().toISOString(),
    });

    this.streaming.emitListenerFired('file-watcher', path, {
      path,
      eventType,
    });
  }
}
