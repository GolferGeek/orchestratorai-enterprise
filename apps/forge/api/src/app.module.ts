import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from '@orchestratorai/planes/database';
import { ConfigProviderModule } from '@orchestratorai/planes/config';
import { StorageModule } from '@orchestratorai/planes/storage';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { LLMPlaneModule } from '@orchestratorai/planes/llm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SystemModule } from './system/system.module';
import { AnalyticsController } from './analytics/analytics.controller';
import { AssetsModule } from './assets/assets.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { ObservabilityPlaneModule } from '@orchestratorai/planes/observability';
import { RagStorageModule } from '@orchestratorai/planes/rag';
import { RagModule } from './rag/rag.module';
import { RbacModule } from './rbac/rbac.module';
import { MarketingModule } from './marketing/marketing.module';
import { EngineeringModule } from './engineering/engineering.module';
import { CustomerServiceModule } from './customer-service/customer-service.module';

// LangGraph Agent Modules
import { SharedServicesModule } from './agents/shared/services/shared-services.module';
import { PersistenceModule } from './agents/shared/persistence/persistence.module';
import { MarketingSwarmModule } from './agents/marketing-swarm/marketing-swarm.module';
import { LegalDepartmentModule } from './agents/legal-department/legal-department.module';
import { CadAgentModule } from './agents/cad-agent/cad-agent.module';
import { BusinessAutomationAdvisorModule } from './agents/business-automation-advisor/business-automation-advisor.module';
import { ExtendedPostWriterModule } from './agents/extended-post-writer/extended-post-writer.module';
import { DataAnalystModule } from './agents/data-analyst/data-analyst.module';
import { HrAssistantModule } from './agents/hr-assistant/hr-assistant.module';
import { CustomerServiceAgentModule } from './agents/customer-service/customer-service.module';
import { RiskRunnerModule } from './agents/risk-runner/risk-runner.module';
import { PredictorModule } from './agents/predictor/predictor.module';

// Agent Registry — provides GET /agents and POST /agent-conversations
import { AgentRegistryModule } from './agent-registry/agent-registry.module';

// Invoke Infrastructure
import { ForgeInvokeModule } from './invoke/invoke.module';
import { CapabilitiesModule } from './invoke/capabilities/capabilities.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        // Use ENV_FILE if explicitly set, otherwise try standard locations
        process.env.ENV_FILE || '',
        // Profile overlay (ENV_PROFILE=azure loads .env.azure before .env)
        ...(process.env.ENV_PROFILE
          ? [
              join(__dirname, `../../../.env.${process.env.ENV_PROFILE}`),
              join(__dirname, `../../../../.env.${process.env.ENV_PROFILE}`),
              join(process.cwd(), `.env.${process.env.ENV_PROFILE}`),
            ]
          : []),
        // Base .env (local-first baseline)
        join(__dirname, '../../../.env'),
        join(__dirname, '../../../../.env'),
        join(process.cwd(), '.env'),
      ].filter(Boolean),
      expandVariables: true,
    }),
    // Core Infrastructure
    HttpModule,
    DatabaseModule,
    ConfigProviderModule,
    StorageModule,
    AuthModule,
    HealthModule,
    EventEmitterModule.forRoot(),

    // LLM Plane — complete LLM implementation (fine_control, simplified, azure_foundry, vertex_ai)
    LLMPlaneModule, // LLM plane: provides LLM_SERVICE token + LLMModule (providers, models, evaluation, cidafm, usage, pii)

    // Standalone Features
    SystemModule,
    AssetsModule,
    WebhooksModule, // LangGraph workflow status webhooks — required for agent SSE streaming
    ObservabilityPlaneModule,
    RagStorageModule,
    RagModule,
    RbacModule,
    MarketingModule, // Marketing Swarm UI configuration endpoints
    EngineeringModule, // CAD agent project/drawing REST endpoints (supports agents/cad-agent)
    CustomerServiceModule, // Customer service widget session + lead capture (uses agents/customer-service)

    // LangGraph Agent Infrastructure
    SharedServicesModule, // LLM HTTP client, observability, HITL helper, RAG client
    PersistenceModule, // PostgreSQL checkpointer for LangGraph state
    // Agent Workflow Modules
    MarketingSwarmModule,
    LegalDepartmentModule,
    CadAgentModule,
    BusinessAutomationAdvisorModule,
    ExtendedPostWriterModule,
    DataAnalystModule,
    HrAssistantModule,
    CustomerServiceAgentModule,
    RiskRunnerModule,
    PredictorModule,

    // Agent Registry — GET /agents, POST /agent-conversations
    AgentRegistryModule,

    // Invoke Infrastructure — must come after agent modules so services are available
    ForgeInvokeModule,
    CapabilitiesModule,
  ],
  controllers: [AppController, AnalyticsController],
  providers: [AppService],
})
export class AppModule {}
