import { Module, OnModuleInit } from '@nestjs/common';
import { SharedServicesModule } from '../shared/services/shared-services.module';
import { PersistenceModule } from '../shared/persistence/persistence.module';
import { ConversationOwnershipModule } from '../../common/conversations/conversation-ownership.module';
import { WorkflowRegistry } from '../catalog/workflow.registry';
import { DecisionRiskController } from './decision-risk.controller';
import { DecisionRiskService } from './decision-risk.service';
import { RiskStoreService } from './risk-store.service';

/**
 * Corporate decision risk.
 *
 * "We are thinking about doing something. What is the risk?" — a LangGraph
 * workflow over the domain-neutral engine in the `risk` schema.
 *
 * It has no row in `agents` and never will: it registers itself here, which is
 * the whole of what adding a workflow now costs.
 */
@Module({
  imports: [SharedServicesModule, PersistenceModule, ConversationOwnershipModule],
  controllers: [DecisionRiskController],
  providers: [DecisionRiskService, RiskStoreService],
  exports: [DecisionRiskService],
})
export class DecisionRiskModule implements OnModuleInit {
  constructor(private readonly registry: WorkflowRegistry) {}

  onModuleInit(): void {
    this.registry.register({
      slug: 'decision-risk',
      name: 'Decision Risk',
      description:
        'State a proposition. Ten weighted dimensions assess it in parallel, a red team contests the result, and the workflow proposes mitigations with a residual score.',
      organizationSlugs: ['corporate'],
      // Moves to the run runtime in the Phase 6 pilot.
      entryPoint: { kind: 'rest', endpoint: '/workflows/decision-risk/assess' },
    });
  }
}
