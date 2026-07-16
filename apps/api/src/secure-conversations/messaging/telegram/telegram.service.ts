import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ChannelAdapter } from '../message-router.service';

@Injectable()
export class TelegramService implements OnModuleInit, ChannelAdapter {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string;
  private readonly webhookUrl: string;
  private readonly apiBase: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN', '');
    this.webhookUrl = this.configService.get<string>(
      'TELEGRAM_WEBHOOK_URL',
      '',
    );
    this.apiBase = `https://api.telegram.org/bot${this.botToken}`;
  }

  async onModuleInit() {
    if (!this.botToken) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN not set — Telegram integration disabled',
      );
      return;
    }
    if (this.webhookUrl) {
      await this.setWebhook(this.webhookUrl);
    }
  }

  async setWebhook(url: string): Promise<void> {
    const response = await firstValueFrom(
      this.httpService.post<{ ok: boolean }>(`${this.apiBase}/setWebhook`, {
        url,
      }),
    );
    this.logger.log(
      `Telegram webhook set: ${response.data?.ok ? 'success' : 'failed'}`,
    );
  }

  async sendTyping(chatId: string): Promise<void> {
    await firstValueFrom(
      this.httpService.post(`${this.apiBase}/sendChatAction`, {
        chat_id: chatId,
        action: 'typing',
      }),
    );
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    await firstValueFrom(
      this.httpService.post(`${this.apiBase}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    );
  }
}
