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
import { AuthGuardsModule } from './auth/auth-guards.module';
import { HealthModule } from './health/health.module';
import { LLMPlaneModule } from '@orchestratorai/planes/llm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SystemModule } from './system/system.module';
import { AssetsModule } from './assets/assets.module';
import { ObservabilityPlaneModule } from '@orchestratorai/planes/observability';
import { RagStorageModule } from '@orchestratorai/planes/rag';
import { RagModule } from './rag/rag.module';
import { RbacModule } from './rbac/rbac.module';
import { SpeechModule } from './speech/speech.module';
import { CrawlerModule } from './crawler/crawler.module';
import { MCPModule } from './mcp/mcp.module';
import { RunnersModule } from './runners/runners.module';
import { InvokeModule } from './invoke/invoke.module';
import { CustomerServiceModule } from './customer-service/customer-service.module';
import { WorkRoutingModule } from '@orchestratorai/planes/work-routing';

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
    AuthGuardsModule,
    HealthModule,
    EventEmitterModule.forRoot(),

    // LLM Plane — complete LLM implementation (fine_control, simplified, azure_foundry, vertex_ai)
    LLMPlaneModule, // LLM plane: provides LLM_SERVICE token + LLMModule (providers, models, evaluation, cidafm, usage, pii)
    InvokeModule, // POST /invoke and POST /invoke/stream — canonical entry point

    // Standalone Features
    SystemModule,
    AssetsModule,
    ObservabilityPlaneModule,
    RagStorageModule,
    RagModule,
    RbacModule,
    SpeechModule,
    CrawlerModule,
    MCPModule,
    RunnersModule,
    CustomerServiceModule,
    WorkRoutingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
