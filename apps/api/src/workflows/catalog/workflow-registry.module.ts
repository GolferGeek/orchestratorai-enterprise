import { Global, Module } from '@nestjs/common';
import { WorkflowCatalogRepository } from './workflow-catalog.repository';
import { WorkflowCatalogService } from './workflow-catalog.service';
import { WorkflowRegistry } from './workflow.registry';

/**
 * Global so a workflow module can register itself without importing the
 * catalog — which would create a cycle, since the catalog imports workflow
 * modules for their services. The catalog service (per-org view, registry
 * mirror) lives here too, for the invoke controller's enabled check.
 */
@Global()
@Module({
  providers: [WorkflowRegistry, WorkflowCatalogRepository, WorkflowCatalogService],
  exports: [WorkflowRegistry, WorkflowCatalogService, WorkflowCatalogRepository],
})
export class WorkflowRegistryModule {}
