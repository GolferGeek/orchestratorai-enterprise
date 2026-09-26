import { Module } from '@nestjs/common';
import { WorkflowCatalogAdminController } from './workflow-catalog-admin.controller';
import { WorkflowCatalogController } from './workflow-catalog.controller';

/** The registry and run runtime modules are global; workflows register themselves. */
@Module({
  controllers: [WorkflowCatalogController, WorkflowCatalogAdminController],
})
export class WorkflowCatalogModule {}
