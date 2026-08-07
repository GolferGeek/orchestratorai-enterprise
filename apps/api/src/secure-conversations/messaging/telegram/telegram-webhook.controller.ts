import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../../../auth/decorators/public.decorator';
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

// External webhook — Telegram authenticates with its configured secret token.
@Public()
@Controller('secure-conversations/webhooks')
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name);

  constructor(
    private readonly messageRouter: MessageRouterService,
    private readonly telegramService: TelegramService,
    configService: ConfigService,
  ) {
    this.webhookSecret = configService
      .get<string>('TELEGRAM_WEBHOOK_SECRET', '')
      .trim();
  }

  private readonly webhookSecret: string;

  @Post('telegram')
  @HttpCode(200)
  handleTelegramWebhook(
    @Body() update: TelegramUpdate,
    @Headers('x-telegram-bot-api-secret-token') suppliedSecret?: string,
  ): { ok: boolean } {
    if (!this.webhookSecret) {
      throw new ServiceUnavailableException(
        'Telegram webhook is not configured',
      );
    }
    if (!this.secretsMatch(suppliedSecret, this.webhookSecret)) {
      throw new UnauthorizedException('Invalid Telegram webhook secret');
    }

    // Only handle text messages in private chats
    if (!update.message?.text || update.message.chat.type !== 'private') {
      return { ok: true };
    }

    const msg = update.message;
    const chatId = String(msg.chat.id);

    // Send typing indicator immediately so user sees feedback
    this.sendTypingIndicator(chatId);

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
      this.sendTypingIndicator(chatId);
    }, 4000);

    try {
      await this.messageRouter.handleInbound(inbound);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to process Telegram message from ${chatId}: ${message}`,
      );
      try {
        await this.telegramService.sendMessage(
          chatId,
          'Sorry, something went wrong. Please try again.',
        );
      } catch (sendError) {
        this.logger.error(
          `Failed to send Telegram error response to ${chatId}: ${sendError instanceof Error ? sendError.message : String(sendError)}`,
        );
      }
    } finally {
      clearInterval(typingInterval);
    }
  }

  private sendTypingIndicator(chatId: string): void {
    this.telegramService.sendTyping(chatId).catch((error) => {
      this.logger.error(
        `Failed to send Telegram typing indicator to ${chatId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  private secretsMatch(
    supplied: string | undefined,
    expected: string,
  ): boolean {
    if (!supplied) {
      return false;
    }
    const suppliedBuffer = Buffer.from(supplied);
    const expectedBuffer = Buffer.from(expected);
    return (
      suppliedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(suppliedBuffer, expectedBuffer)
    );
  }
}
