import { Module } from '@nestjs/common';
import { HierarchyController } from './hierarchy.controller';
import { AgentRegistryService } from '../services/agent-registry.service';
import { AgentsRepository } from '../repositories/agents.repository';
// DATABASE_SERVICE provided by @Global DatabaseModule plane
@Module({
  imports: [],
  controllers: [HierarchyController],
  providers: [AgentRegistryService, AgentsRepository],
  exports: [],
})
export class HierarchyModule {}
