import { ConfigService } from '@nestjs/config';
import { getExpectedTwilioSignature } from 'twilio';
import { MessageRouterService } from './message-router.service';
import { TelegramWebhookController } from './telegram/telegram-webhook.controller';
import { TelegramService } from './telegram/telegram.service';
import { WhatsAppWebhookController } from './whatsapp/whatsapp-webhook.controller';

function config(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string, fallback: string) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

describe('Secure Conversations webhook controllers', () => {
  const router = {
    handleInbound: jest.fn(async () => 'ok'),
  } as unknown as MessageRouterService;
  const telegram = {
    sendTyping: jest.fn(async () => undefined),
    sendMessage: jest.fn(async () => undefined),
  } as unknown as TelegramService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects Telegram requests when the webhook secret is absent', () => {
    const controller = new TelegramWebhookController(
      router,
      telegram,
      config({}),
    );
    expect(() =>
      controller.handleTelegramWebhook({ update_id: 1 }),
    ).toThrow('not configured');
  });

  it('rejects an invalid Telegram webhook secret', () => {
    const controller = new TelegramWebhookController(
      router,
      telegram,
      config({ TELEGRAM_WEBHOOK_SECRET: 'expected-secret' }),
    );
    expect(() =>
      controller.handleTelegramWebhook(
        { update_id: 1 },
        'incorrect-secret',
      ),
    ).toThrow('Invalid Telegram webhook secret');
  });

  it('accepts a valid Telegram webhook secret', () => {
    const controller = new TelegramWebhookController(
      router,
      telegram,
      config({ TELEGRAM_WEBHOOK_SECRET: 'expected-secret' }),
    );
    expect(
      controller.handleTelegramWebhook(
        { update_id: 1 },
        'expected-secret',
      ),
    ).toEqual({ ok: true });
  });

  it('rejects WhatsApp requests unless token and canonical URL are configured', async () => {
    const controller = new WhatsAppWebhookController(router, config({}));
    await expect(
      controller.handleWhatsAppWebhook(
        {},
        { headers: {} } as never,
      ),
    ).rejects.toThrow('not configured');
  });

  it('rejects a forged Twilio signature', async () => {
    const controller = new WhatsAppWebhookController(
      router,
      config({
        TWILIO_AUTH_TOKEN: 'test-token',
        TWILIO_WEBHOOK_URL:
          'https://example.test/secure-conversations/webhooks/whatsapp',
      }),
    );
    await expect(
      controller.handleWhatsAppWebhook(
        { From: 'whatsapp:+15555550100', Body: 'hello' },
        { headers: { 'x-twilio-signature': 'forged' } } as never,
      ),
    ).rejects.toThrow('Invalid Twilio webhook signature');
  });

  it('accepts a correctly signed Twilio request and normalizes the sender', async () => {
    const authToken = 'test-token';
    const webhookUrl =
      'https://example.test/secure-conversations/webhooks/whatsapp';
    const body = {
      From: 'whatsapp:+15555550100',
      Body: 'hello',
      MessageSid: 'message-1',
      ProfileName: 'Test User',
    };
    const signature = getExpectedTwilioSignature(authToken, webhookUrl, body);
    const controller = new WhatsAppWebhookController(
      router,
      config({
        TWILIO_AUTH_TOKEN: authToken,
        TWILIO_WEBHOOK_URL: webhookUrl,
      }),
    );

    await expect(
      controller.handleWhatsAppWebhook(body, {
        headers: { 'x-twilio-signature': signature },
      } as never),
    ).resolves.toBe('<Response></Response>');
    expect(router.handleInbound).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'whatsapp',
        senderId: '+15555550100',
        messageText: 'hello',
        messageId: 'message-1',
      }),
    );
  });
});
