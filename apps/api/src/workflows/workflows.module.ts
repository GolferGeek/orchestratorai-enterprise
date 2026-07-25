import { Module } from '@nestjs/common';
import { MarketingSwarmModule } from './marketing-swarm/marketing-swarm.module';
import { WorkflowCatalogModule } from './catalog/workflow-catalog.module';
import { PersistenceModule } from './shared/persistence/persistence.module';
import { SharedServicesModule } from './shared/services/shared-services.module';

@Module({
  imports: [
    SharedServicesModule,
    PersistenceModule,
    MarketingSwarmModule,
    WorkflowCatalogModule,
  ],
})
export class WorkflowsModule {}
