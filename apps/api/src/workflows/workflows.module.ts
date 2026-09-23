import { Module } from '@nestjs/common';
import { MarketingSwarmModule } from './marketing-swarm/marketing-swarm.module';
import { WorkflowCatalogModule } from './catalog/workflow-catalog.module';
import { PersistenceModule } from './shared/persistence/persistence.module';
import { SharedServicesModule } from './shared/services/shared-services.module';
import { WorkflowStreamingModule } from './streaming/workflow-streaming.module';
import { WorkflowRegistryModule } from './catalog/workflow-registry.module';

@Module({
  imports: [
    WorkflowRegistryModule,
    SharedServicesModule,
    PersistenceModule,
    MarketingSwarmModule,
    WorkflowCatalogModule,
    WorkflowStreamingModule,
  ],
})
export class WorkflowsModule {}
