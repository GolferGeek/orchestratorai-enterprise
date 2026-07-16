/**
 * SecureConversationsInvokeModule
 *
 * Wires the SecureConversationsInvokeController and SecureConversationsDispatchService into the NestJS
 * module graph. Imports InboundModule and RegistryModule to access:
 * - A2ARouterService (inbound routing to Workflows/Agents/Ambient)
 * - ExternalRegistryService (external agent registry and trust scoring)
 *
 * SecureConversationsDatabaseService is available globally via SecureConversationsDatabaseModule.
 * OBSERVABILITY_SERVICE is available globally via ObservabilityPlaneModule.
 * ConfigService is available globally via ConfigModule.forRoot().
 */

import { Module } from '@nestjs/common';
import { SecureConversationsInvokeController } from './invoke.controller';
import { SecureConversationsDispatchService } from './secure-conversations-dispatch.service';
import { InboundModule } from '../inbound/inbound.module';
import { RegistryModule } from '../registry/registry.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Module({
  imports: [InboundModule, RegistryModule],
  controllers: [SecureConversationsInvokeController],
  providers: [SecureConversationsDispatchService, JwtAuthGuard],
  exports: [SecureConversationsDispatchService],
})
export class SecureConversationsInvokeModule {}
