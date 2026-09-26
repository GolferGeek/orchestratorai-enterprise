import { Global, Module } from '@nestjs/common';
import { AgentDefinitionsRepository } from './agent-definitions.repository';
import { WorkflowAgentRuntime } from './workflow-agent.runtime';

/** Global: workflow steps and work units invoke agents. */
@Global()
@Module({
  providers: [AgentDefinitionsRepository, WorkflowAgentRuntime],
  exports: [WorkflowAgentRuntime, AgentDefinitionsRepository],
})
export class WorkflowAgentsModule {}
