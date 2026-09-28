import { Global, Module } from '@nestjs/common';
import { AgentOverridesRepository } from './agent-overrides.repository';
import { WorkflowAdminController } from './workflow-admin.controller';
import { WorkflowAdminRegistry } from './workflow-admin.registry';

/** Global: workflow modules register their admin sections; the API serves the admin page. */
@Global()
@Module({
  controllers: [WorkflowAdminController],
  providers: [WorkflowAdminRegistry, AgentOverridesRepository],
  exports: [WorkflowAdminRegistry],
})
export class WorkflowAdminModule {}
