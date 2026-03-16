import { Controller, Post, Body, Logger, HttpCode } from '@nestjs/common';
import {
  MessageRouterService,
  InboundMessage,
} from '../message-router.service';
import { TelegramService } from './telegram.service';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    text?: string;
    date: number;
  };
}

@Controller('webhooks')
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name);

  constructor(
    private readonly messageRouter: MessageRouterService,
    private readonly telegramService: TelegramService,
  ) {}

  @Post('telegram')
  @HttpCode(200)
  handleTelegramWebhook(@Body() update: TelegramUpdate): { ok: boolean } {
    // Only handle text messages in private chats
    if (!update.message?.text || update.message.chat.type !== 'private') {
      return { ok: true };
    }

    const msg = update.message;
    const chatId = String(msg.chat.id);

    // Send typing indicator immediately so user sees feedback
    this.telegramService.sendTyping(chatId).catch(() => {});

    const inbound: InboundMessage = {
      channel: 'telegram',
      senderId: chatId,
      senderName: [msg.from.first_name, msg.from.last_name]
        .filter(Boolean)
        .join(' '),
      messageText: msg.text!,
      messageId: String(msg.message_id),
      metadata: {
        username: msg.from.username,
        updateId: update.update_id,
      },
    };

    // Process async — Telegram needs 200 within seconds, but OpenClaw may take longer
    void this.processInBackground(inbound, chatId);

    return { ok: true };
  }

  private async processInBackground(
    inbound: InboundMessage,
    chatId: string,
  ): Promise<void> {
    // Repeat typing indicator every 4s (Telegram expires it after 5s)
    const typingInterval = setInterval(() => {
      this.telegramService.sendTyping(chatId).catch(() => {});
    }, 4000);

    try {
      await this.messageRouter.handleInbound(inbound);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to process Telegram message from ${chatId}: ${message}`,
      );
      await this.telegramService
        .sendMessage(chatId, 'Sorry, something went wrong. Please try again.')
        .catch(() => {});
    } finally {
      clearInterval(typingInterval);
    }
  }
}
