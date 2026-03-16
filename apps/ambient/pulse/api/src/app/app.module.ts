import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

// Planes — @Global() modules providing platform infrastructure
import { DatabaseModule } from '@orchestratorai/planes/database';
import { LLMPlaneModule } from '@orchestratorai/planes/llm';
import { ConfigProviderModule } from '@orchestratorai/planes/config';
import { ObservabilityModule } from '../observability/observability.module';
import { LLMModule } from '../llms/llm.module';

// Shared infrastructure
import { CrawlerModule } from '../crawler/crawler.module';

// Processing modules — predictor & risk analysis engines
import { PredictorModule } from '../processing/predictor/predictor.module';
import { RiskRunnerModule } from '../processing/risk-runner/risk-runner.module';

@Module({
  imports: [
    // NestJS infrastructure
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),

    // Global platform planes — @Global(), available everywhere
    DatabaseModule,
    LLMPlaneModule,
    ConfigProviderModule,
    ObservabilityModule,
    LLMModule,

    // Shared infrastructure
    CrawlerModule,

    // Pulse-specific infrastructure
    EventBusModule,
    AmbientDatabaseModule,

    // Processing engines
    PredictorModule,
    RiskRunnerModule,

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
