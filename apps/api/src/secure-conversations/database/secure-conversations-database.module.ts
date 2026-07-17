import { Global, Module } from '@nestjs/common';
import { SecureConversationsDatabaseService } from './secure-conversations-database.service';

/**
 * SecureConversationsDatabaseModule — Global module that provides SecureConversationsDatabaseService.
 *
 * Marked @Global() so all other Secure Conversations modules can inject SecureConversationsDatabaseService
 * without importing this module explicitly.
 *
 * Requires DatabaseModule (from planes/) to be registered in AppModule first,
 * as SecureConversationsDatabaseService injects DATABASE_SERVICE.
 */
@Global()
@Module({
  providers: [SecureConversationsDatabaseService],
  exports: [SecureConversationsDatabaseService],
})
export class SecureConversationsDatabaseModule {}
