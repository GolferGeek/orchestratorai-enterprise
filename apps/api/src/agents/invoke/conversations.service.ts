/**
 * Conversations Service
 *
 * Fetches conversation records from the database for the sidebar nav.
 * Uses DATABASE_SERVICE via Symbol injection — no direct Supabase imports.
 */

import { Injectable, Logger, Inject, NotFoundException } from '@nestjs/common';
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

export interface ConversationMessageRecord {
  id: string;
  role: string;
  content: string;
  outputType: string;
  metadata: Record<string, unknown>;
  attachments: Array<{ filename: string; mimeType: string }> | null;
  createdAt: string;
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /**
   * Fetch all conversations for a given user, ordered by last_active_at desc.
   */
  async fetchForUser(
    userId: string,
    organizationSlug: string,
  ): Promise<ConversationRecord[]> {
    let query = this.db
      .from(null, 'conversations')
      .select(
        'id, agent_name, agent_type, organization_slug, started_at, last_active_at, message_count, primary_work_product_type, primary_work_product_id, metadata',
      )
      .eq('user_id', userId);

    if (organizationSlug !== '*') {
      query = query.eq('organization_slug', organizationSlug);
    }

    const result: {
      data: unknown;
      error: { message: string; code?: string } | null;
    } = await query.order('last_active_at', { ascending: false });

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
        id: this.requireString(r.id, 'conversation.id'),
        agentName: this.requireString(r.agent_name, 'conversation.agent_name'),
        agentType: this.requireString(r.agent_type, 'conversation.agent_type'),
        organizationSlug: this.requireString(
          r.organization_slug,
          'conversation.organization_slug',
        ),
        startedAt: this.requireTimestamp(
          r.started_at,
          'conversation.started_at',
        ),
        lastActiveAt: this.optionalTimestamp(
          r.last_active_at,
          'conversation.last_active_at',
        ),
        messageCount: this.requireNumber(
          r.message_count,
          'conversation.message_count',
        ),
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

  async fetchMessagesForUser(
    conversationId: string,
    userId: string,
    organizationSlug: string,
  ): Promise<ConversationMessageRecord[]> {
    await this.assertOwned(conversationId, userId, organizationSlug);

    const result: {
      data: unknown;
      error: { message: string; code?: string } | null;
    } = await this.db
      .from(null, 'conversation_messages')
      .select(
        'id, role, content, output_type, metadata, attachments, created_at',
      )
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (result.error) {
      throw new Error(`Failed to load messages: ${result.error.message}`);
    }

    const rows = Array.isArray(result.data) ? result.data : [];
    return rows.map((row: unknown) => {
      const record = row as Record<string, unknown>;
      return {
        id: this.requireString(record.id, 'message.id'),
        role: this.requireString(record.role, 'message.role'),
        content: this.requireString(record.content, 'message.content'),
        outputType: this.requireString(
          record.output_type,
          'message.output_type',
        ),
        metadata: this.parseMetadata(record.metadata, record.id),
        attachments: this.parseAttachments(record.attachments, record.id),
        createdAt: this.requireTimestamp(
          record.created_at,
          'message.created_at',
        ),
      };
    });
  }

  async deleteForUser(
    conversationId: string,
    userId: string,
    organizationSlug: string,
  ): Promise<void> {
    await this.assertOwned(conversationId, userId, organizationSlug);

    let query = this.db
      .from(null, 'conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_id', userId);
    if (organizationSlug !== '*') {
      query = query.eq('organization_slug', organizationSlug);
    }

    const result = await query;
    if (result.error) {
      throw new Error(`Failed to delete conversation: ${result.error.message}`);
    }
  }

  private async assertOwned(
    conversationId: string,
    userId: string,
    organizationSlug: string,
  ): Promise<void> {
    let query = this.db
      .from(null, 'conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId);
    if (organizationSlug !== '*') {
      query = query.eq('organization_slug', organizationSlug);
    }

    const result = (await query.single()) as {
      data: { id: string } | null;
      error: { message: string; code?: string } | null;
    };

    if (result.error && result.error.code !== 'PGRST116') {
      throw new Error(
        `Failed to verify conversation ownership: ${result.error.message}`,
      );
    }
    if (result.error?.code === 'PGRST116' || !result.data) {
      throw new NotFoundException(`Conversation not found: ${conversationId}`);
    }
  }

  private parseMetadata(
    value: unknown,
    messageId: unknown,
  ): Record<string, unknown> {
    if (value === null || value === undefined) {
      return {};
    }
    const parsed = this.parseStoredJson(value, 'metadata', messageId);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`Message ${String(messageId)} has malformed metadata`);
    }
    return parsed as Record<string, unknown>;
  }

  private parseAttachments(
    value: unknown,
    messageId: unknown,
  ): Array<{ filename: string; mimeType: string }> | null {
    if (value === null || value === undefined) {
      return null;
    }
    const parsed = this.parseStoredJson(value, 'attachments', messageId);
    if (!Array.isArray(parsed)) {
      throw new Error(`Message ${String(messageId)} has malformed attachments`);
    }
    return parsed.map((attachment, index) => {
      if (typeof attachment !== 'object' || attachment === null) {
        throw new Error(
          `Message ${String(messageId)} has malformed attachment ${index}`,
        );
      }
      const record = attachment as Record<string, unknown>;
      return {
        filename: this.requireString(
          record.filename,
          `message attachment ${index}.filename`,
        ),
        mimeType: this.requireString(
          record.mimeType,
          `message attachment ${index}.mimeType`,
        ),
      };
    });
  }

  private parseStoredJson(
    value: unknown,
    field: string,
    messageId: unknown,
  ): unknown {
    if (typeof value !== 'string') {
      return value;
    }
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new Error(`Message ${String(messageId)} has malformed ${field}`);
    }
  }

  private requireString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${field} must be a non-empty string`);
    }
    return value;
  }

  private requireTimestamp(value: unknown, field: string): string {
    if (value instanceof Date) {
      if (!Number.isFinite(value.getTime())) {
        throw new Error(`${field} must be a valid timestamp`);
      }
      return value.toISOString();
    }
    const timestamp = this.requireString(value, field);
    if (!Number.isFinite(Date.parse(timestamp))) {
      throw new Error(`${field} must be a valid timestamp`);
    }
    return timestamp;
  }

  private optionalTimestamp(value: unknown, field: string): string | null {
    if (value === null) {
      return null;
    }
    return this.requireTimestamp(value, field);
  }

  private requireNumber(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${field} must be a finite number`);
    }
    return value;
  }
}
