import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelAdapter } from '../message-router.service';
import twilio, { Twilio } from 'twilio';

@Injectable()
export class WhatsAppService implements ChannelAdapter {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;
  private client: Twilio | null = null;

  constructor(private readonly configService: ConfigService) {
    this.accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID', '');
    this.authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN', '');
    this.fromNumber = this.configService.get<string>(
      'TWILIO_WHATSAPP_NUMBER',
      '',
    );

    if (this.accountSid && this.authToken) {
      this.client = twilio(this.accountSid, this.authToken);
      this.logger.log('Twilio WhatsApp client initialized');
    } else {
      this.logger.log(
        'TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN not set — WhatsApp integration disabled',
      );
    }
  }

  async sendMessage(to: string, text: string): Promise<void> {
    if (!this.client) {
      throw new Error('Twilio WhatsApp client is not configured');
    }

    await this.client.messages.create({
      body: text,
      from: `whatsapp:${this.fromNumber}`,
      to: `whatsapp:${to}`,
    });
  }
}
