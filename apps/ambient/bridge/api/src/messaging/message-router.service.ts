import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  MESSAGING_DATABASE_SERVICE,
  MessagingDatabaseService,
  QueryResult,
} from './messaging-database.interface';
import { OpenClawBridgeService } from './openclaw-bridge.service';

export interface InboundMessage {
  channel: 'telegram' | 'whatsapp' | 'flow' | 'sms';
  senderId: string;
  senderName?: string;
  messageText: string;
  messageId: string;
  metadata?: Record<string, unknown>;
}

export interface OutboundMessage {
  channel: 'telegram' | 'whatsapp' | 'flow' | 'sms';
  recipientId: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelAdapter {
  sendMessage(recipientId: string, text: string): Promise<void>;
}

@Injectable()
export class MessageRouterService {
  private readonly logger = new Logger(MessageRouterService.name);
  private adapters = new Map<string, ChannelAdapter>();

  constructor(
    @Inject(MESSAGING_DATABASE_SERVICE) private readonly db: MessagingDatabaseService,
    private readonly openClawBridge: OpenClawBridgeService,
  ) {}

  registerAdapter(channel: string, adapter: ChannelAdapter) {
    this.adapters.set(channel, adapter);
    this.logger.log(`Registered messaging adapter: ${channel}`);
  }

  async handleInbound(message: InboundMessage): Promise<string> {
    this.logger.log(
      `Inbound ${message.channel} message from ${message.senderId}: ${message.messageText.substring(0, 100)}`,
    );

    // Check allowlist
    const channelUser = await this.findOrRejectUser(
      message.channel,
      message.senderId,
      message.senderName,
    );
    if (!channelUser) {
      this.logger.warn(
        `Rejected message from unallowed ${message.channel} user: ${message.senderId}`,
      );
      return 'User not in allowlist';
    }

    // Log inbound message
    await this.logMessage(
      channelUser.id,
      message.channel,
      'inbound',
      message.messageText,
      message.messageId,
      message.metadata,
    );

    // Forward to OpenClaw via the bridge
    const response = await this.processMessage(
      message.messageText,
      channelUser,
    );

    // Send reply via the originating channel
    const adapter = this.adapters.get(message.channel);
    if (adapter) {
      await adapter.sendMessage(message.senderId, response);
      await this.logMessage(
        channelUser.id,
        message.channel,
        'outbound',
        response,
        undefined,
        undefined,
      );
    }

    return response;
  }

  /**
   * Send an outbound notification to a channel user (e.g., task completion)
   */
  async sendOutbound(message: OutboundMessage): Promise<void> {
    const adapter = this.adapters.get(message.channel);
    if (!adapter) {
      this.logger.warn(`No adapter registered for channel: ${message.channel}`);
      return;
    }

    await adapter.sendMessage(message.recipientId, message.text);
    this.logger.log(
      `Outbound ${message.channel} notification sent to ${message.recipientId}`,
    );
  }

  private processMessage(
    text: string,
    channelUser: { id: string; display_name: string | null },
  ): Promise<string> {
    return this.openClawBridge.processMessage(text, channelUser);
  }

  private async findOrRejectUser(
    channel: string,
    channelUserId: string,
    displayName?: string,
  ): Promise<{ id: string; display_name: string | null } | null> {
    // Look up existing channel user
    const { data: existing } = (await this.db
      .from(null, 'channel_users')
      .select('id, display_name, is_allowed')
      .eq('channel', channel)
      .eq('channel_user_id', channelUserId)
      .single()) as QueryResult<unknown>;

    if (existing) {
      const row = existing as Record<string, unknown>;
      if (!row['is_allowed']) return null;
      return {
        id: row['id'] as string,
        display_name: row['display_name'] as string | null,
      };
    }

    // Auto-create entry (not allowed by default — admin must approve)
    await this.db.from(null, 'channel_users').insert({
      channel,
      channel_user_id: channelUserId,
      display_name: displayName || null,
      is_allowed: false,
    });

    this.logger.log(
      `New ${channel} user registered (pending approval): ${channelUserId}`,
    );
    return null; // Not allowed until admin approves
  }

  private async logMessage(
    channelUserId: string,
    channel: string,
    direction: string,
    messageText: string,
    channelMessageId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.db.from(null, 'channel_message_log').insert({
      channel_user_id: channelUserId,
      channel,
      direction,
      message_text: messageText,
      channel_message_id: channelMessageId || null,
      metadata: metadata || {},
    });
  }
}
