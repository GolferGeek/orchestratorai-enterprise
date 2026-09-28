import { Inject, Logger, Module, OnModuleInit } from '@nestjs/common';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import { CHECKPOINT_SAVER } from '@orchestratorai/planes/checkpointer';
import { WorkflowRegistry } from '../catalog/workflow.registry';
import { WorkflowHandlerRegistry } from '../shared/runs';
import { WorkflowExporterRegistry } from '../shared/export';
import { IssueLedgerService } from '../shared/ledger';
import { WorkflowRestartService } from '../shared/restarts';
import { WorkUnitService } from '../shared/work-units';
import { decisionRiskExporter } from './decision-risk.exporter';
import { createDecisionRiskGraph } from './decision-risk.graph';
import {
  DECISION_RISK_MODEL_ROLES,
  DECISION_RISK_RESTART_POINTS,
  DECISION_RISK_SLUG,
  createDecisionRiskHandler,
  decisionRiskRunTitle,
  parseDecisionRiskInput,
} from './decision-risk.handler';
import { RiskStoreService } from './risk-store.service';
import { DecisionRiskAdmin } from './decision-risk.admin';
import { WorkflowAdminRegistry } from '../shared/admin';

/**
 * Corporate decision risk: "we are thinking about doing something; what is
 * the risk?" The first workflow on the shared runtime (the Phase 6 pilot):
 * started through POST /workflows/invoke, run by the worker, with work units,
 * a human gate on mitigations, and per-role models from the org's profile.
 */
@Module({
  providers: [RiskStoreService, DecisionRiskAdmin],
})
export class DecisionRiskModule implements OnModuleInit {
  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly handlers: WorkflowHandlerRegistry,
    private readonly units: WorkUnitService,
    private readonly store: RiskStoreService,
    private readonly ledger: IssueLedgerService,
    private readonly exporters: WorkflowExporterRegistry,
    private readonly restarts: WorkflowRestartService,
    private readonly admin: WorkflowAdminRegistry,
    private readonly riskAdmin: DecisionRiskAdmin,
    @Inject(CHECKPOINT_SAVER) private readonly checkpointer: BaseCheckpointSaver,
  ) {}

  onModuleInit(): void {
    const graph = createDecisionRiskGraph({
      units: this.units,
      store: this.store,
      ledger: this.ledger,
      checkpointer: this.checkpointer,
      logger: new Logger('DecisionRisk'),
    });
    this.handlers.register(createDecisionRiskHandler(graph, this.restarts));
    this.exporters.register(decisionRiskExporter);
    this.admin.register(DECISION_RISK_SLUG, this.riskAdmin.sections());
    this.registry.register({
      slug: DECISION_RISK_SLUG,
      name: 'Decision Risk',
      description:
        'State a proposition. Ten weighted dimensions assess it in parallel, a red team contests the result, you review the proposed mitigations, and the workflow reports a residual score.',
      organizationSlugs: ['corporate'],
      icon: 'shield',
      defaultGroup: 'Strategy',
      defaultLifecycle: 'dev',
      hitl: true,
      dataClassification: 'confidential',
      entryPoint: {
        kind: 'runtime',
        maxAttempts: 2,
        modelRoles: DECISION_RISK_MODEL_ROLES,
        accessControl: { mode: 'owner' },
        parseStartInput: (input) => ({ ...parseDecisionRiskInput(input) }),
        runTitle: decisionRiskRunTitle,
        restartPoints: DECISION_RISK_RESTART_POINTS,
      },
    });
  }
}
