import { Global, Module } from '@nestjs/common';
import { WorkflowRegistry } from './workflow.registry';

/**
 * Global so a workflow module can register itself without importing the
 * catalog — which would create a cycle, since the catalog imports workflow
 * modules for their services.
 */
@Global()
@Module({
  providers: [WorkflowRegistry],
  exports: [WorkflowRegistry],
})
export class WorkflowRegistryModule {}
