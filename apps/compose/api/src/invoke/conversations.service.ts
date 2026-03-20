/**
 * Conversations Service
 *
 * Fetches conversation records from the database for the sidebar nav.
 * Uses DATABASE_SERVICE via Symbol injection — no direct Supabase imports.
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { DATABASE_SERVICE } from '@orchestrator-ai/transport-types';
import type { DatabaseService } from '@orchestrator-ai/transport-types';

export interface ConversationRecord {
  id: string;
  agentName: string;
  agentType: string;
  organizationSlug: string;
  startedAt: string;
  lastActiveAt: string;
  messageCount: number;
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Fetch all conversations for a given user, ordered by last_active_at desc.
   */
  async fetchForUser(userId: string): Promise<ConversationRecord[]> {
    const result: { data: unknown; error: unknown } = await this.db
      .from(null, 'conversations')
      .select(
        'id, agent_name, agent_type, organization_slug, started_at, last_active_at, message_count',
      )
      .eq('user_id', userId)
      .order('last_active_at', { ascending: false });

    if (result.error) {
      this.logger.error(
        `Failed to fetch conversations for user ${userId}: ${String(result.error)}`,
      );
      throw new Error(
        `Failed to fetch conversations: ${String(result.error)}`,
      );
    }

    const rows = Array.isArray(result.data) ? result.data : [];

    return rows.map((row: unknown) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string,
        agentName: (r.agent_name as string) ?? '',
        agentType: (r.agent_type as string) ?? 'context',
        organizationSlug: (r.organization_slug as string) ?? 'global',
        startedAt: (r.started_at as string) ?? new Date().toISOString(),
        lastActiveAt: (r.last_active_at as string) ?? new Date().toISOString(),
        messageCount: (r.message_count as number) ?? 0,
      };
    });
  }
}
