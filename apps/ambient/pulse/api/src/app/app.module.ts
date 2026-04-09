import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { HealthModule } from '../health/health.module';
import { WellKnownModule } from '../well-known/well-known.module';
import { ListenersModule } from '../listeners/listeners.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { ScenariosModule } from '../scenarios/scenarios.module';
import { StreamingModule } from '../streaming/streaming.module';
import { EventBusModule } from '../event-bus/event-bus.module';
import { AmbientDatabaseModule } from '../ambient-database/database.module';
import { ServicesModule } from '../services/services.module';
import { TriggersModule } from '../triggers/triggers.module';
import { ExecutionsModule } from '../executions/executions.module';
import { InvokeModule } from '../invoke/invoke.module';
import { AuthModule } from '../auth/auth.module';
import { AuthGuardsModule } from '../auth/auth-guards.module';
import { RbacModule } from '../rbac/rbac.module';

// Planes — @Global() modules providing platform infrastructure
import { DatabaseModule } from '@orchestratorai/planes/database';
import { LLMPlaneModule } from '@orchestratorai/planes/llm';
import { ConfigProviderModule } from '@orchestratorai/planes/config';
import { ObservabilityPlaneModule } from '@orchestratorai/planes/observability';

@Module({
  imports: [
    // NestJS infrastructure — load apps/.env for DEFAULT_LLM_PROVIDER/MODEL (ollama/qwen2.5:7b)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), '..', '..', '.env'), // apps/.env when cwd is apps/ambient/pulse
        join(process.cwd(), '..', '..', '..', '.env'), // apps/.env when cwd is apps/ambient/pulse/api
        '.env',
      ],
    }),
    EventEmitterModule.forRoot(),

    // Auth infrastructure — providers for IDENTITY_PROVIDER, AUTH_SERVICE, StreamTokenService
    AuthModule,
    // RBAC service — provides RbacService used by AuthGuardsModule
    RbacModule,
    // Shared auth guards from @orchestratorai/auth-client (bridges planes → auth-client tokens)
    AuthGuardsModule,

    // Global platform planes — @Global(), available everywhere
    DatabaseModule,
    LLMPlaneModule, // LLM plane: provides LLM_SERVICE token + LLMModule (providers, models, evaluation, cidafm, usage, pii)
    ConfigProviderModule,
    ObservabilityPlaneModule,

    // Pulse-specific infrastructure
    EventBusModule,
    AmbientDatabaseModule,

    // Feature modules
    HealthModule,
    WellKnownModule,
    ListenersModule,
    WorkflowsModule,
    ScenariosModule,
    StreamingModule,
    ServicesModule,
    TriggersModule,
    ExecutionsModule,

    // Invoke — A2A entry point + dispatch handlers
    InvokeModule,
  ],
})
export class AppModule {}
