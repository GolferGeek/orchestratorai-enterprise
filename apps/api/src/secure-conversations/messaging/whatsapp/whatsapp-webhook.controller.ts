import {
  Body,
  Controller,
  Header,
  HttpCode,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validateRequest } from 'twilio';
import { Public } from '../../../auth/decorators/public.decorator';
import {
  MessageRouterService,
  InboundMessage,
} from '../message-router.service';
import { Request } from 'express';

// External webhook — Twilio authenticates requests with X-Twilio-Signature.
@Public()
@Controller('secure-conversations/webhooks')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);
  private readonly authToken: string;
  private readonly webhookUrl: string;

  constructor(
    private readonly messageRouter: MessageRouterService,
    private readonly configService: ConfigService,
  ) {
    this.authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN', '');
    this.webhookUrl = this.configService.get<string>('TWILIO_WEBHOOK_URL', '');
  }

  @Post('whatsapp')
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  async handleWhatsAppWebhook(
    @Body() body: Record<string, string>,
    @Req() req: Request,
  ): Promise<string> {
    if (!this.authToken || !this.webhookUrl) {
      throw new ServiceUnavailableException(
        'WhatsApp webhook is not configured',
      );
    }

    const twilioSignature = req.headers['x-twilio-signature'];
    if (
      typeof twilioSignature !== 'string' ||
      !validateRequest(
        this.authToken,
        twilioSignature,
        this.webhookUrl,
        body,
      )
    ) {
      this.logger.warn('Rejected WhatsApp webhook with invalid signature');
      throw new UnauthorizedException('Invalid Twilio webhook signature');
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
