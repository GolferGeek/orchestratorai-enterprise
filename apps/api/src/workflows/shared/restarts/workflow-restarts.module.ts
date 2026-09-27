import { Global, Module } from '@nestjs/common';
import { WorkflowRestartService } from './workflow-restart.service';

/** Global: a workflow's handler forks restarted runs through it. */
@Global()
@Module({
  providers: [WorkflowRestartService],
  exports: [WorkflowRestartService],
})
export class WorkflowRestartsModule {}
