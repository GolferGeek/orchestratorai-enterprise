import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelAdapter } from '../message-router.service';

interface TwilioClient {
  messages: {
    create: (options: {
      body: string;
      from: string;
      to: string;
    }) => Promise<unknown>;
  };
}

@Injectable()
export class WhatsAppService implements ChannelAdapter {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;
  private client: TwilioClient | null = null;

  constructor(private readonly configService: ConfigService) {
    this.accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID', '');
    this.authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN', '');
    this.fromNumber = this.configService.get<string>(
      'TWILIO_WHATSAPP_NUMBER',
      '',
    );

    if (this.accountSid && this.authToken) {
      // Dynamic import to avoid requiring twilio when not configured
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const twilio = require('twilio');
         
        this.client = twilio(this.accountSid, this.authToken) as TwilioClient;
        this.logger.log('Twilio WhatsApp client initialized');
      } catch {
        this.logger.warn(
          'twilio package not installed — WhatsApp integration disabled',
        );
      }
    } else {
      this.logger.warn(
        'TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN not set — WhatsApp integration disabled',
      );
    }
  }

  async sendMessage(to: string, text: string): Promise<void> {
    if (!this.client) {
      this.logger.error('Twilio client not initialized');
      return;
    }

    await this.client.messages.create({
      body: text,
      from: `whatsapp:${this.fromNumber}`,
      to: `whatsapp:${to}`,
    });
  }
}
