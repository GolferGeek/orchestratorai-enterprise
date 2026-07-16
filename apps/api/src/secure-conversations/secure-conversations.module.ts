import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvokeModule as AgentInvokeModule } from '../agents/invoke/invoke.module';
import { SecureConversationsDatabaseModule } from './database/secure-conversations-database.module';
import { SecureConversationsHealthModule } from './health/secure-conversations-health.module';
import { InboundModule } from './inbound/inbound.module';
import { SecureConversationsInvokeModule } from './invoke/invoke.module';
import { MessagingModule } from './messaging/messaging.module';
import { OutboundModule } from './outbound/outbound.module';
import { ProtocolModule } from './protocol/protocol.module';
import { RegistryModule } from './registry/registry.module';
import { SecurityModule } from './security/security.module';
import { StreamingModule } from './streaming/streaming.module';
import { TrainingModule } from './training/training.module';
import { WellKnownModule } from './well-known/well-known.module';

@Module({
  imports: [
    AuthModule,
    AgentInvokeModule,
    SecureConversationsDatabaseModule,
    SecureConversationsHealthModule,
    ProtocolModule,
    InboundModule,
    OutboundModule,
    SecurityModule,
    RegistryModule,
    StreamingModule,
    TrainingModule,
    MessagingModule,
    WellKnownModule,
    SecureConversationsInvokeModule,
  ],
})
export class SecureConversationsModule {}
