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
import { LLMModule } from '@/llms/llm.module';
import { LLMPlaneModule } from '@orchestratorai/planes/llm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SovereignPolicyModule } from './llms/config/sovereign-policy.module';
import { SystemModule } from './system/system.module';
import { AssetsModule } from './assets/assets.module';
import { ObservabilityModule } from './observability/observability.module';
import { RagStorageModule } from '@orchestratorai/planes/rag';
import { RagModule } from './rag/rag.module';
import { RbacModule } from './rbac/rbac.module';
import { SpeechModule } from './speech/speech.module';
import { CrawlerModule } from './crawler/crawler.module';
import { MCPModule } from './mcp/mcp.module';
import { RunnersModule } from './runners/runners.module';
import { InvokeModule } from './invoke/invoke.module';

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

    // Main Modules
    LLMModule, // Includes: providers, models, evaluation, cidafm, usage, pii
    LLMPlaneModule, // LLM plane: provides LLM_SERVICE token
    InvokeModule, // POST /invoke and POST /invoke/stream — canonical entry point

    // Standalone Features
    SovereignPolicyModule,
    SystemModule,
    AssetsModule,
    ObservabilityModule,
    RagStorageModule,
    RagModule,
    RbacModule,
    SpeechModule,
    CrawlerModule,
    MCPModule,
    RunnersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
