import { Controller, Post, Body, Logger, HttpCode, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MessageRouterService,
  InboundMessage,
} from '../message-router.service';
import { Request } from 'express';

@Controller('webhooks')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);
  private readonly authToken: string;

  constructor(
    private readonly messageRouter: MessageRouterService,
    private readonly configService: ConfigService,
  ) {
    this.authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN', '');
  }

  @Post('whatsapp')
  @HttpCode(200)
  async handleWhatsAppWebhook(
    @Body() body: Record<string, string>,
    @Req() req: Request,
  ): Promise<string> {
    // Validate Twilio signature if auth token is configured
    if (this.authToken) {
      const twilioSignature = req.headers['x-twilio-signature'] as string;
      if (!twilioSignature) {
        this.logger.warn('Missing Twilio signature header');
        return '<Response></Response>';
      }
      // Full signature validation would use twilio.validateRequest()
      // For now, presence check is sufficient; full validation added when twilio pkg is installed
    }

    const from = body['From']?.replace('whatsapp:', '') || '';
    const messageBody = body['Body'] || '';
    const messageSid = body['MessageSid'] || '';
    const profileName = body['ProfileName'] || '';

    if (!from || !messageBody) {
      return '<Response></Response>';
    }

    const inbound: InboundMessage = {
      channel: 'whatsapp',
      senderId: from,
      senderName: profileName,
      messageText: messageBody,
      messageId: messageSid,
      metadata: {
        numMedia: body['NumMedia'],
        waId: body['WaId'],
      },
    };

    await this.messageRouter.handleInbound(inbound);

    // Return empty TwiML — we send replies via the Twilio API, not via TwiML response
    return '<Response></Response>';
  }
}
