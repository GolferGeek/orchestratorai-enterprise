import { Module } from '@nestjs/common';
import { ConversationOwnershipService } from './conversation-ownership.service';

@Module({
  providers: [ConversationOwnershipService],
  exports: [ConversationOwnershipService],
})
export class ConversationOwnershipModule {}
