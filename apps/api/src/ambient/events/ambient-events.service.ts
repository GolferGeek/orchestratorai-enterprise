import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AmbientDatabaseService, AmbientEventRow } from '../ambient-database/database.service';
import { AmbientEventBusService } from '../event-bus/ambient-event-bus.service';
import { StreamingService } from '../streaming/streaming.service';
import { ListenerRegistryService } from '../listeners/listener-registry.service';

export interface PushEventInput {
  /** Dotted lowercase name a trigger matches on, e.g. 'invoice.received'. */
  name: string;
  payload: Record<string, unknown>;
  /** Who pushed it: 'api:<user id>', a module name, later 'a2a:<agent slug>'. */
  source: string;
  /** Pushing the same key twice for one event name is one event. */
  dedupeKey?: string;
}

export interface PushEventResult {
  event: AmbientEventRow;
  /** True when the dedupe key was already used: nothing was emitted again. */
  duplicate: boolean;
}

export const EVENT_NAME = /^[a-z0-9]+([._-][a-z0-9]+)*$/;

/**
 * Push mode: something hands ambient an event instead of ambient watching for
 * it. The event is stored first (so its id means something to whoever pushed
 * it, and a restart cannot lose it), then emitted to the bus, where triggers
 * with source_type 'event' match it by name.
 */
@Injectable()
export class AmbientEventsService implements OnModuleInit {
  private readonly logger = new Logger(AmbientEventsService.name);
  private readonly LISTENER_ID = 'ambient-push';

  constructor(
    private readonly database: AmbientDatabaseService,
    private readonly eventBus: AmbientEventBusService,
    private readonly streaming: StreamingService,
    private readonly registry: ListenerRegistryService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.LISTENER_ID, 'push', 'Pushed events');
    this.registry.activate(this.LISTENER_ID);
  }

  async push(orgSlug: string, input: PushEventInput): Promise<PushEventResult> {
    if (!orgSlug || orgSlug === '*') {
      throw new Error('An ambient event belongs to one organization');
    }
    if (!EVENT_NAME.test(input.name)) {
      throw new Error(`Event name "${input.name}" must be lowercase words joined by '.', '_' or '-'`);
    }
    if (!input.source) {
      throw new Error('An ambient event needs a source');
    }

    const stored = await this.database.insertEvent({
      org_slug: orgSlug,
      name: input.name,
      source: input.source,
      payload: input.payload,
      dedupe_key: input.dedupeKey ?? null,
    });
    if (stored.duplicate) {
      this.logger.log(`Event ${input.name} (${input.dedupeKey}) already received as ${stored.event.id}`);
      return stored;
    }

    const { event } = stored;
    this.registry.recordFiring(this.LISTENER_ID);
    this.eventBus.emit({
      orgSlug,
      sourceType: 'event',
      pushed: { id: event.id, name: event.name, source: event.source },
      payload: event.payload,
      timestamp: event.received_at,
    });
    this.streaming.emitListenerFired(orgSlug, 'push', event.name, {
      eventId: event.id,
      source: event.source,
    });
    return stored;
  }
}
