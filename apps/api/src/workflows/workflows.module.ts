import { Module } from '@nestjs/common';
import { MarketingSwarmModule } from './marketing-swarm/marketing-swarm.module';
import { DecisionRiskModule } from './decision-risk/decision-risk.module';
import { WorkflowCatalogModule } from './catalog/workflow-catalog.module';
import { SharedServicesModule } from './shared/services/shared-services.module';
import { WorkflowStreamingModule } from './streaming/workflow-streaming.module';
import { WorkflowRegistryModule } from './catalog/workflow-registry.module';
import { WorkflowRunsModule } from './shared/runs/workflow-runs.module';
import { WorkflowInvokeModule } from './invoke/workflow-invoke.module';
import { WorkflowDocumentsModule } from './shared/documents/workflow-documents.module';
import { HumanReviewsModule } from './shared/reviews';
import { WorkflowModelsModule } from './shared/models';
import { WorkflowAgentsModule } from './shared/agents';

@Module({
  imports: [
    WorkflowRegistryModule,
    WorkflowRunsModule,
    WorkflowDocumentsModule,
    HumanReviewsModule,
    WorkflowModelsModule,
    WorkflowAgentsModule,
    SharedServicesModule,
    MarketingSwarmModule,
    DecisionRiskModule,
    WorkflowCatalogModule,
    WorkflowStreamingModule,
    WorkflowInvokeModule,
  ],
})
export class WorkflowsModule {}
