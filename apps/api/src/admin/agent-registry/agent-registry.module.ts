import { Module } from '@nestjs/common';
import { InvokeModule } from '../../agents/invoke/invoke.module';
import { AgentRegistryController } from './agent-registry.controller';
import { AgentRegistryService } from './agent-registry.service';

@Module({
  imports: [InvokeModule],
  controllers: [AgentRegistryController],
  providers: [AgentRegistryService],
})
export class AgentRegistryModule {}
