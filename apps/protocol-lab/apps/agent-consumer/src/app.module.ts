import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { WellKnownController } from './well-known/well-known.controller';
import { AgentCardModule } from './agent-card/agent-card.module';
import { ResearchClientModule } from './research-client/research-client.module';
import { ExplorerModule } from './explorer/explorer.module';

@Module({
  imports: [
    AgentCardModule,
    ResearchClientModule,
    ExplorerModule,
  ],
  controllers: [HealthController, WellKnownController],
  providers: [],
})
export class AppModule {}
