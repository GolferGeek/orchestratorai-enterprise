import { Module } from '@nestjs/common';
import { ConversationOwnershipModule } from '../../common/conversations/conversation-ownership.module';
import { WorkflowInvokeController } from './workflow-invoke.controller';

/** `POST /workflows/invoke`. The registry and run runtime modules are global. */
@Module({
  imports: [ConversationOwnershipModule],
  controllers: [WorkflowInvokeController],
})
export class WorkflowInvokeModule {}
