import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import {
  DatabaseChangeEventType,
  DatabaseChangeHandler,
  DatabaseChangeStreamService,
  DatabaseChangeSubscription,
} from './database-change-stream.interface';
import { SupabaseService } from './supabase-client.service';

@Injectable()
export class SupabaseDatabaseChangeStreamService
  implements DatabaseChangeStreamService, OnModuleDestroy
{
  private readonly channels = new Map<string, RealtimeChannel>();

  constructor(private readonly supabaseService: SupabaseService) {}

  async subscribe(
    subscription: DatabaseChangeSubscription,
    handler: DatabaseChangeHandler,
  ): Promise<() => Promise<void>> {
    if (subscription.events.length === 0) {
      throw new Error(
        'Database change subscriptions require at least one event',
      );
    }

    const channelId = `database-change-${randomUUID()}`;
    const channel = this.supabaseService
      .getServiceClient()
      .channel(channelId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: subscription.schema,
          table: subscription.table,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const eventType = payload.eventType as DatabaseChangeEventType;
          if (!subscription.events.includes(eventType)) {
            return;
          }
          handler({
            schema: subscription.schema,
            table: subscription.table,
            eventType,
            new: this.toRecord(payload.new),
            old: this.toRecord(payload.old),
          });
        },
      );

    await new Promise<void>((resolve, reject) => {
      channel.subscribe((status, error) => {
        if (status === 'SUBSCRIBED') {
          this.channels.set(channelId, channel);
          resolve();
          return;
        }
        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          reject(
            error ??
              new Error(
                `Supabase database change channel '${channelId}' entered status ${status}`,
              ),
          );
        }
      });
    });

    return async () => {
      const result = await this.supabaseService
        .getServiceClient()
        .removeChannel(channel);
      this.channels.delete(channelId);
      if (result !== 'ok') {
        throw new Error(
          `Failed to remove Supabase database change channel '${channelId}': ${result}`,
        );
      }
    };
  }

  async close(): Promise<void> {
    const removals = [...this.channels.entries()].map(
      async ([channelId, channel]) => {
        const result = await this.supabaseService
          .getServiceClient()
          .removeChannel(channel);
        if (result !== 'ok') {
          throw new Error(
            `Failed to remove Supabase database change channel '${channelId}': ${result}`,
          );
        }
      },
    );
    await Promise.all(removals);
    this.channels.clear();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      return null;
    }
    return value as Record<string, unknown>;
  }
}
