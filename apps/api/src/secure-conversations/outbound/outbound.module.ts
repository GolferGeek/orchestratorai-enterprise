import { Module } from '@nestjs/common';
import { A2ASenderService } from './a2a-sender.service';
import { A2ASenderController } from './a2a-sender.controller';
import { SecurityModule } from '../security/security.module';
import { RegistryModule } from '../registry/registry.module';

/**
 * OutboundModule — handles all outbound A2A traffic to external agents.
 *
 * SecureConversationsDatabaseService and SecureConversationsProtocolService are provided by their respective
 * global modules (SecureConversationsDatabaseModule, ProtocolModule) and are available here
 * without explicit import.
 */
@Module({
  imports: [SecurityModule, RegistryModule],
  controllers: [A2ASenderController],
  providers: [A2ASenderService],
  exports: [A2ASenderService],
})
export class OutboundModule {}
