import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { join } from 'path';
import { AdminModule } from './admin/admin.module';
import { AgentsModule } from './agents/agents.module';
import { AmbientModule } from './ambient/ambient.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { InvokeModule } from './invoke/invoke.module';
import { MarketingModule } from './marketing/marketing.module';
import { RagModule } from './rag/rag.module';
import { RbacModule } from './rbac/rbac.module';
import { SecureConversationsModule } from './secure-conversations/secure-conversations.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { DatabaseModule } from '@orchestratorai/planes/database';
import { ConfigProviderModule } from '@orchestratorai/planes/config';
import { ExtractorsModule } from '@orchestratorai/planes/extractors';
import { LLMPlaneModule } from '@orchestratorai/planes/llm';
import { ObservabilityPlaneModule } from '@orchestratorai/planes/observability';
import { RagStorageModule } from '@orchestratorai/planes/rag';
import { StorageModule } from '@orchestratorai/planes/storage';
import { WorkRoutingModule } from '@orchestratorai/planes/work-routing';

const explicitEnvFiles = process.env.ENV_FILE ? [process.env.ENV_FILE] : [];
const profileEnvFiles = process.env.ENV_PROFILE
  ? [
      join(__dirname, `../../../.env.${process.env.ENV_PROFILE}`),
      join(__dirname, `../../../../.env.${process.env.ENV_PROFILE}`),
      join(process.cwd(), `.env.${process.env.ENV_PROFILE}`),
    ]
  : [];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        ...explicitEnvFiles,
        ...profileEnvFiles,
        join(__dirname, '../../../.env'),
        join(__dirname, '../../../.env.secrets'),
        join(__dirname, '../../../../.env'),
        join(__dirname, '../../../../.env.secrets'),
        join(process.cwd(), '.env'),
        join(process.cwd(), '.env.secrets'),
      ],
      expandVariables: true,
    }),
    HttpModule,
    DatabaseModule,
    ConfigProviderModule,
    StorageModule,
    EventEmitterModule.forRoot(),
    ObservabilityPlaneModule,
    LLMPlaneModule,
    RagStorageModule,
    ExtractorsModule,
    WorkRoutingModule,
    HealthModule,
    AuthModule,
    RbacModule,
    AdminModule,
    AgentsModule,
    MarketingModule,
    WorkflowsModule,
    AmbientModule,
    SecureConversationsModule,
    RagModule,
    IntegrationsModule,
    InvokeModule,
  ],
})
export class AppModule {}
