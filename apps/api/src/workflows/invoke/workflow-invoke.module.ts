import { Global, Module } from '@nestjs/common';
import { ConversationOwnershipModule } from '../../common/conversations/conversation-ownership.module';
import { WorkflowInvokeController } from './workflow-invoke.controller';
import { WorkflowUploadController } from './workflow-upload.controller';
import { WorkflowRunLauncher } from './workflow-run-launcher.service';

/**
 * `POST /workflows/invoke` and `POST /workflows/uploads`. The registry, run
 * runtime and documents modules are global. Global itself: ambient triggers
 * launch runs through the WorkflowRunLauncher.
 */
@Global()
@Module({
  imports: [ConversationOwnershipModule],
  controllers: [WorkflowInvokeController, WorkflowUploadController],
  providers: [WorkflowRunLauncher],
  exports: [WorkflowRunLauncher],
})
export class WorkflowInvokeModule {}
