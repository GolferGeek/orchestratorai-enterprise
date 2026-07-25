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
  lastActiveAt: string | null;
  messageCount: number;
  primaryWorkProductType: string | null;
  primaryWorkProductId: string | null;
  previewTitle: string | null;
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Fetch all conversations for a given user, ordered by last_active_at desc.
   */
  async fetchForUser(userId: string): Promise<ConversationRecord[]> {
    const result: {
      data: unknown;
      error: { message: string; code?: string } | null;
    } = await this.db
      .from(null, 'conversations')
      .select(
        'id, agent_name, agent_type, organization_slug, started_at, last_active_at, message_count, primary_work_product_type, primary_work_product_id, metadata',
      )
      .eq('user_id', userId)
      .order('last_active_at', { ascending: false });

    if (result.error) {
      this.logger.error(
        `Failed to fetch conversations for user ${userId}: ${result.error.message}`,
      );
      throw new Error(`Failed to fetch conversations: ${result.error.message}`);
    }

    const rows = Array.isArray(result.data) ? result.data : [];

    return rows.map((row: unknown) => {
      const r = row as Record<string, unknown>;
      const metadata = r.metadata as Record<string, unknown> | null;
      const titleFromMetadata =
        typeof metadata?.title === 'string' ? metadata.title.trim() : '';
      const previewTitle = titleFromMetadata.length > 0 ? titleFromMetadata : null;

      return {
        id: r.id as string,
        agentName: r.agent_name as string,
        agentType: r.agent_type as string,
        organizationSlug: r.organization_slug as string,
        startedAt: r.started_at as string,
        lastActiveAt: r.last_active_at as string | null,
        messageCount: typeof r.message_count === 'number' ? r.message_count : 0,
        primaryWorkProductType:
          typeof r.primary_work_product_type === 'string'
            ? r.primary_work_product_type
            : null,
        primaryWorkProductId:
          typeof r.primary_work_product_id === 'string'
            ? r.primary_work_product_id
            : null,
        previewTitle,
      };
    });
  }
}
