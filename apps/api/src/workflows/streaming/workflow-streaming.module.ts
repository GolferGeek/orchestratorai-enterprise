import { Module } from '@nestjs/common';
import { WorkflowStreamController } from './workflow-stream.controller';

@Module({ controllers: [WorkflowStreamController] })
export class WorkflowStreamingModule {}
