import { Module } from '@nestjs/common';
import { SecureConversationsHealthController } from './secure-conversations-health.controller';

@Module({
  controllers: [SecureConversationsHealthController],
})
export class SecureConversationsHealthModule {}
