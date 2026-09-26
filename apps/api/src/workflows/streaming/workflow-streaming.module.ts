import { Module } from '@nestjs/common';
import { WorkflowStreamController } from './workflow-stream.controller';

/** The registry and run runtime modules are global. */
@Module({ controllers: [WorkflowStreamController] })
export class WorkflowStreamingModule {}
