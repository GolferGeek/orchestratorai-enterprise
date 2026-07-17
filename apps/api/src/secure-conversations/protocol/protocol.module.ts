import { Global, Module } from '@nestjs/common';
import { SecureConversationsProtocolService } from './secure-conversations-protocol.service';

/**
 * ProtocolModule — Global module providing SecureConversationsProtocolService.
 *
 * Marked @Global() so all other Secure Conversations modules can inject SecureConversationsProtocolService
 * without importing this module explicitly.
 */
@Global()
@Module({
  providers: [SecureConversationsProtocolService],
  exports: [SecureConversationsProtocolService],
})
export class ProtocolModule {}
