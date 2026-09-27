import { Module } from '@nestjs/common';
import { WorkflowDocsController } from './workflow-docs.controller';
import { DEFAULT_WORKFLOW_DOCS_ROOT, WORKFLOW_DOCS_ROOT, WorkflowDocsService } from './workflow-docs.service';

@Module({
  controllers: [WorkflowDocsController],
  providers: [WorkflowDocsService, { provide: WORKFLOW_DOCS_ROOT, useValue: DEFAULT_WORKFLOW_DOCS_ROOT }],
})
export class WorkflowDocsModule {}
