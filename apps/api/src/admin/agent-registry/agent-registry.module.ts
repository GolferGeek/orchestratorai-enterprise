import { Module } from '@nestjs/common';
import { AgentRegistryController } from './agent-registry.controller';
import { AgentRegistryService } from './agent-registry.service';

@Module({
  controllers: [AgentRegistryController],
  providers: [AgentRegistryService],
})
export class AgentRegistryModule {}
