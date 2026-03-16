import { Module, forwardRef } from '@nestjs/common';
import { Agent2AgentModule } from '@/agent2agent/agent2agent.module';
import { ObservabilityModule } from '@/observability/observability.module';
import { EngineeringController } from './engineering.controller';
import { EngineeringService } from './engineering.service';

@Module({
  imports: [ObservabilityModule, forwardRef(() => Agent2AgentModule)],
  controllers: [EngineeringController],
  providers: [EngineeringService],
  exports: [EngineeringService],
})
export class EngineeringModule {}
