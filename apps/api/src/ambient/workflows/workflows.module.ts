import { Module } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowRegistryService } from './workflow-registry.service';
import { WorkflowExecutorService } from './workflow-executor.service';
import { StreamingModule } from '../streaming/streaming.module';
import { ServicesModule } from '../services/services.module';
import { InvokeModule } from '../../agents/invoke/invoke.module';

@Module({
  imports: [StreamingModule, ServicesModule, InvokeModule],
  controllers: [WorkflowsController],
  providers: [WorkflowRegistryService, WorkflowExecutorService],
  exports: [WorkflowRegistryService, WorkflowExecutorService],
})
export class WorkflowsModule {}
