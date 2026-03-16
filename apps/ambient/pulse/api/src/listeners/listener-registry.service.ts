import { Injectable, Logger } from '@nestjs/common';

export type ListenerType = 'db-watcher' | 'file-watcher' | 'internal-a2a' | 'cron';

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
 * External A2A communication belongs to Bridge, not Pulse.
 */
@Injectable()
export class ListenerRegistryService {
  private readonly logger = new Logger(ListenerRegistryService.name);
  private readonly listeners = new Map<string, ListenerStatus>();

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
