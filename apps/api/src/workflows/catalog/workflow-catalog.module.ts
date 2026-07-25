import { Module } from '@nestjs/common';
import { InvokeModule } from '../../agents/invoke/invoke.module';
import { MarketingSwarmModule } from '../marketing-swarm/marketing-swarm.module';
import { WorkflowCatalogController } from './workflow-catalog.controller';

@Module({
  imports: [InvokeModule, MarketingSwarmModule],
  controllers: [WorkflowCatalogController],
})
export class WorkflowCatalogModule {}
