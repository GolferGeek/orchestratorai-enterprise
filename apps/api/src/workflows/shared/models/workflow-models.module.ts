import { Global, Module } from '@nestjs/common';
import { ModelProfilesController } from './model-profiles.controller';
import { ModelProfilesRepository } from './model-profiles.repository';
import { WorkflowLlmClient } from './workflow-llm.client';

/** Global: the invoke controller snapshots profiles; workflow steps call models. */
@Global()
@Module({
  controllers: [ModelProfilesController],
  providers: [ModelProfilesRepository, WorkflowLlmClient],
  exports: [ModelProfilesRepository, WorkflowLlmClient],
})
export class WorkflowModelsModule {}
