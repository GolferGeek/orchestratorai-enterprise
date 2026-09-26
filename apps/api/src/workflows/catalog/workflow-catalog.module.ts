import { Module } from '@nestjs/common';
import { WorkflowCatalogController } from './workflow-catalog.controller';

/** The registry and run runtime modules are global; workflows register themselves. */
@Module({
  controllers: [WorkflowCatalogController],
})
export class WorkflowCatalogModule {}
