import { Module } from '@nestjs/common';
import { MarketingSwarmModule } from '../marketing-swarm/marketing-swarm.module';
import { WorkflowCatalogController } from './workflow-catalog.controller';

@Module({
  imports: [MarketingSwarmModule],
  controllers: [WorkflowCatalogController],
})
export class WorkflowCatalogModule {}
