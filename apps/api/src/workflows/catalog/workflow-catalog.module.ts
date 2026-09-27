import { Module } from '@nestjs/common';
import { WorkflowCatalogAdminController } from './workflow-catalog-admin.controller';
import { WorkflowCatalogController } from './workflow-catalog.controller';
import { WorkflowCardsController } from './workflow-cards.controller';

/** The registry and run runtime modules are global; workflows register themselves. */
@Module({
  controllers: [WorkflowCardsController, WorkflowCatalogController, WorkflowCatalogAdminController],
})
export class WorkflowCatalogModule {}
