import { Module } from '@nestjs/common';
import { MarketingSwarmModule } from './marketing-swarm/marketing-swarm.module';
import { DecisionRiskModule } from './decision-risk/decision-risk.module';
import { WorkflowCatalogModule } from './catalog/workflow-catalog.module';
import { PersistenceModule } from './shared/persistence/persistence.module';
import { SharedServicesModule } from './shared/services/shared-services.module';
import { WorkflowStreamingModule } from './streaming/workflow-streaming.module';
import { WorkflowRegistryModule } from './catalog/workflow-registry.module';
import { WorkflowRunsModule } from './shared/runs/workflow-runs.module';
import { WorkflowInvokeModule } from './invoke/workflow-invoke.module';

@Module({
  imports: [
    WorkflowRegistryModule,
    WorkflowRunsModule,
    SharedServicesModule,
    PersistenceModule,
    MarketingSwarmModule,
    DecisionRiskModule,
    WorkflowCatalogModule,
    WorkflowStreamingModule,
    WorkflowInvokeModule,
  ],
})
export class WorkflowsModule {}
