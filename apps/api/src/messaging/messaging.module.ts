import { Module, OnModuleInit } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MessageRouterService } from './message-router.service';
import { OpenClawSecureConversationsService } from './openclaw-secure-conversations.service';
import { OpenClawSecureConversationsSupabasePersistenceService } from './openclaw-secure-conversations-supabase-persistence.service';
import { OPENCLAW_SECURE_CONVERSATIONS_PERSISTENCE } from './openclaw-secure-conversations-persistence.interface';
import { MESSAGING_DATABASE_SERVICE } from './messaging-database.interface';
import { MessagingSupabaseDatabaseService } from './messaging-database.service';
import { TelegramService } from './telegram/telegram.service';
import { TelegramWebhookController } from './telegram/telegram-webhook.controller';
import { WhatsAppService } from './whatsapp/whatsapp.service';
import { WhatsAppWebhookController } from './whatsapp/whatsapp-webhook.controller';

@Module({
  imports: [HttpModule],
  controllers: [TelegramWebhookController, WhatsAppWebhookController],
  providers: [
    MessagingSupabaseDatabaseService,
    {
      provide: MESSAGING_DATABASE_SERVICE,
      useExisting: MessagingSupabaseDatabaseService,
    },
    MessageRouterService,
    OpenClawSecureConversationsService,
    OpenClawSecureConversationsSupabasePersistenceService,
    {
      provide: OPENCLAW_SECURE_CONVERSATIONS_PERSISTENCE,
      useExisting: OpenClawSecureConversationsSupabasePersistenceService,
    },
    TelegramService,
    WhatsAppService,
  ],
  exports: [MessageRouterService],
})
export class MessagingModule implements OnModuleInit {
  constructor(
    private readonly messageRouter: MessageRouterService,
    private readonly telegramService: TelegramService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  onModuleInit() {
    // Register channel adapters with the message router
    this.messageRouter.registerAdapter('telegram', this.telegramService);
    this.messageRouter.registerAdapter('whatsapp', this.whatsAppService);
  }
}
