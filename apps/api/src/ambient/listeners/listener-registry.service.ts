import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG_PROVIDER_SERVICE, type ConfigProvider } from '@orchestratorai/planes/config';

export type ListenerType = 'db-watcher' | 'file-watcher' | 'storage-watcher' | 'mailbox-watcher' | 'push' | 'cron';

export interface ListenerStatus {
  id: string;
  type: ListenerType;
  name: string;
  active: boolean;
  lastFiredAt: string | null;
  firingCount: number;
}

/**
 * Registry tracking all internal event listener definitions and their runtime status.
 * Listeners are internal-only: DB changes, file system events, internal A2A messages.
 * External A2A communication belongs to the Gatehouse, not Ambient.
 */
@Injectable()
export class ListenerRegistryService {
  private readonly logger = new Logger(ListenerRegistryService.name);
  private readonly listeners = new Map<string, ListenerStatus>();
  /**
   * AMBIENT_LISTENERS_ENABLED (required, "true"/"false"). Off for an instance
   * that must not act on triggers - the deploy's boot probe of a new image,
   * which shares the live database with the running API.
   */
  readonly listenersEnabled: boolean;

  constructor(@Inject(CONFIG_PROVIDER_SERVICE) config: ConfigProvider) {
    const value = config.getRequired('AMBIENT_LISTENERS_ENABLED');
    if (value !== 'true' && value !== 'false') throw new Error('AMBIENT_LISTENERS_ENABLED must be "true" or "false"');
    this.listenersEnabled = value === 'true';
  }

  register(id: string, type: ListenerType, name: string): void {
    this.listeners.set(id, {
      id,
      type,
      name,
      active: false,
      lastFiredAt: null,
      firingCount: 0,
    });
    this.logger.log(`Registered listener: ${name} (${type})`);
  }

  activate(id: string): void {
    const listener = this.listeners.get(id);
    if (listener) {
      listener.active = true;
    }
  }

  deactivate(id: string): void {
    const listener = this.listeners.get(id);
    if (listener) {
      listener.active = false;
    }
  }

  recordFiring(id: string): void {
    const listener = this.listeners.get(id);
    if (listener) {
      listener.lastFiredAt = new Date().toISOString();
      listener.firingCount += 1;
    }
  }

  getAll(): ListenerStatus[] {
    return Array.from(this.listeners.values());
  }

  getById(id: string): ListenerStatus | undefined {
    return this.listeners.get(id);
  }
}
