import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LLMModule } from '@/llms/llm.module';
import { AgentsRepository } from './repositories/agents.repository';
import { ConversationPlansRepository } from './repositories/conversation-plans.repository';
import { OrganizationCredentialsRepository } from './repositories/organization-credentials.repository';
import { PlanEngineService } from './services/plan-engine.service';
import { AgentRegistryService } from './services/agent-registry.service';
import { AgentRuntimeDefinitionService } from './services/agent-runtime-definition.service';
import { AgentRuntimeExecutionService } from './services/agent-runtime-execution.service';
import { AgentRuntimePromptService } from './services/agent-runtime-prompt.service';
import { AgentRuntimeDispatchService } from './services/agent-runtime-dispatch.service';
import { AgentRuntimeStreamService } from './services/agent-runtime-stream.service';
import { AgentRegistryInvalidationService } from './services/agent-registry-invalidation.service';
import { AgentRuntimeMetricsService } from './services/agent-runtime-metrics.service';
import { AgentRuntimeLifecycleService } from './services/agent-runtime-lifecycle.service';
import { AgentRuntimeDeliverablesAdapter } from './services/agent-runtime-deliverables.adapter';
import { AgentRuntimePlansAdapter } from './services/agent-runtime-plans.adapter';
import { DeliverablesModule } from '@/agent2agent/deliverables/deliverables.module';
import { PlansModule } from '@/agent2agent/plans/plans.module';
import { AssetsModule } from '@/assets/assets.module';
// NOTE: Agent2AgentModule import removed - was causing circular dependency
// AgentPlatformModule only needs the sub-modules (Deliverables, Plans, Tasks, ContextOptimization)
// which are already imported directly below
import { AgentRuntimeNormalizationService } from './services/agent-runtime-normalization.service';
import { AgentRuntimeRedactionService } from './services/agent-runtime-redaction.service';
import { HumanApprovalsRepository } from './repositories/human-approvals.repository';
import { RedactionPatternsRepository } from './repositories/redaction-patterns.repository';
import { AgentApprovalsController } from './controllers/agent-approvals.controller';
import { AgentsAdminController } from './controllers/agents-admin.controller';
import { AgentsPublicController } from './controllers/agents-public.controller';
import { AgentValidationService } from './services/agent-validation.service';
import { AgentDryRunService } from './services/agent-dry-run.service';
import { AgentPolicyService } from './services/agent-policy.service';
import { AgentBuilderService } from './services/agent-builder.service';
import { AgentPromotionService } from './services/agent-promotion.service';
import { HierarchyModule } from './hierarchy/hierarchy.module';
import { TasksModule } from '@/agent2agent/tasks/tasks.module';
import { ContextOptimizationModule } from '@/agent2agent/context-optimization/context-optimization.module';

@Module({
  imports: [
    LLMModule,
    HttpModule,
    DeliverablesModule,
    PlansModule,
    AssetsModule,
    ContextOptimizationModule,
    // Agent Platform Sub-modules
    HierarchyModule,
    TasksModule,
  ],
  controllers: [
    AgentApprovalsController,
    AgentsAdminController,
    AgentsPublicController,
  ],
  providers: [
    AgentsRepository,
    RedactionPatternsRepository,
    HumanApprovalsRepository,
    ConversationPlansRepository,
    OrganizationCredentialsRepository,
    PlanEngineService,
    AgentRegistryService,
    AgentRuntimeDefinitionService,
    AgentRuntimeExecutionService,
    AgentRuntimePromptService,
    AgentRuntimeDispatchService,
    AgentRuntimeStreamService,
    AgentRegistryInvalidationService,
    AgentRuntimeMetricsService,
    AgentRuntimeLifecycleService,
    AgentRuntimeDeliverablesAdapter,
    AgentRuntimePlansAdapter,
    AgentRuntimeNormalizationService,
    AgentRuntimeRedactionService,
    AgentValidationService,
    AgentDryRunService,
    AgentPolicyService,
    AgentBuilderService,
    AgentPromotionService,
  ],
  exports: [
    AgentsRepository,
    RedactionPatternsRepository,
    HumanApprovalsRepository,
    ConversationPlansRepository,
    OrganizationCredentialsRepository,
    PlanEngineService,
    AgentRegistryService,
    AgentRuntimeDefinitionService,
    AgentRuntimeExecutionService,
    AgentRuntimePromptService,
    AgentRuntimeDispatchService,
    AgentRuntimeStreamService,
    AgentRegistryInvalidationService,
    AgentRuntimeMetricsService,
    AgentRuntimeLifecycleService,
    AgentRuntimeDeliverablesAdapter,
    AgentRuntimePlansAdapter,
    AgentRuntimeNormalizationService,
    AgentRuntimeRedactionService,
    AgentValidationService,
    AgentDryRunService,
    AgentPolicyService,
    AgentBuilderService,
    AgentPromotionService,
  ],
})
export class AgentPlatformModule {}
