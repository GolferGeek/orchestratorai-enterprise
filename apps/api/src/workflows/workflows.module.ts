import { Module } from '@nestjs/common';
import { MarketingSwarmModule } from './marketing-swarm/marketing-swarm.module';
import { DecisionRiskModule } from './decision-risk/decision-risk.module';
import { ExecDigestModule } from './exec-digest/exec-digest.module';
import { CompetitorWatchModule } from './competitor-watch/competitor-watch.module';
import { InvoiceReviewModule } from './invoice-review/invoice-review.module';
import { SubmittalReviewModule } from './submittal-review/submittal-review.module';
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
import { WorkUnitsModule } from './shared/work-units';
import { WorkflowDocsModule } from './shared/docs';
import { WorkflowRestartsModule } from './shared/restarts';
import { WorkflowQualityModule } from './shared/quality';
import { WorkflowExportModule } from './shared/export';
import { IssueLedgerModule } from './shared/ledger';

@Module({
  imports: [
    WorkflowRegistryModule,
    WorkflowRunsModule,
    WorkflowDocumentsModule,
    HumanReviewsModule,
    WorkflowModelsModule,
    WorkflowAgentsModule,
    WorkUnitsModule,
    IssueLedgerModule,
    WorkflowExportModule,
    WorkflowDocsModule,
    WorkflowRestartsModule,
    WorkflowQualityModule,
    SharedServicesModule,
    MarketingSwarmModule,
    DecisionRiskModule,
    ExecDigestModule,
    CompetitorWatchModule,
    InvoiceReviewModule,
    SubmittalReviewModule,
    WorkflowCatalogModule,
    WorkflowStreamingModule,
    WorkflowInvokeModule,
  ],
})
export class WorkflowsModule {}
