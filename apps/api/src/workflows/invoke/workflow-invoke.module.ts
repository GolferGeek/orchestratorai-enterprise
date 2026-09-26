import { Module } from '@nestjs/common';
import { ConversationOwnershipModule } from '../../common/conversations/conversation-ownership.module';
import { WorkflowInvokeController } from './workflow-invoke.controller';
import { WorkflowUploadController } from './workflow-upload.controller';

/**
 * `POST /workflows/invoke` and `POST /workflows/uploads`. The registry, run
 * runtime and documents modules are global.
 */
@Module({
  imports: [ConversationOwnershipModule],
  controllers: [WorkflowInvokeController, WorkflowUploadController],
})
export class WorkflowInvokeModule {}
