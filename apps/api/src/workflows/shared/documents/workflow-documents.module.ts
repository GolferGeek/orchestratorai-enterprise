import { Global, Module } from '@nestjs/common';
import { WorkflowDocumentsService } from './workflow-documents.service';

/** Global: the invoke, upload and catalog controllers all use it. */
@Global()
@Module({
  providers: [WorkflowDocumentsService],
  exports: [WorkflowDocumentsService],
})
export class WorkflowDocumentsModule {}
