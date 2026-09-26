import { Global, Module } from '@nestjs/common';
import { WorkflowHandlerRegistry } from './workflow-handler.registry';
import { WorkflowRunsRepository } from './workflow-runs.repository';
import { WorkflowWorkerService } from './workflow-worker.service';

/**
 * The workflow run runtime: the run table, the handler registry workflows
 * register with, and the worker that executes queued runs.
 *
 * Global so a workflow module can register its handler without importing
 * this module's consumers (the same reason WorkflowRegistryModule is).
 */
@Global()
@Module({
  providers: [WorkflowRunsRepository, WorkflowHandlerRegistry, WorkflowWorkerService],
  exports: [WorkflowRunsRepository, WorkflowHandlerRegistry],
})
export class WorkflowRunsModule {}
