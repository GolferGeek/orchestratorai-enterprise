import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { WellKnownModule } from './well-known/well-known.module';
import { InboundModule } from './inbound/inbound.module';
import { OutboundModule } from './outbound/outbound.module';
import { SecurityModule } from './security/security.module';
import { RegistryModule } from './registry/registry.module';
import { StreamingModule } from './streaming/streaming.module';
import { TrainingModule } from './training/training.module';
import { MessagingModule } from './messaging/messaging.module';
import { BridgeDatabaseModule } from './database/bridge-database.module';
import { ProtocolModule } from './protocol/protocol.module';
import { BridgeInvokeModule } from './invoke/invoke.module';

// Platform planes — @Global() modules providing DATABASE_SERVICE, OBSERVABILITY_SERVICE
import { DatabaseModule } from '@orchestratorai/planes/database';
import { ObservabilityPlaneModule } from '@orchestratorai/planes/observability';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global platform planes — must come before feature modules so injected
    // providers are available everywhere without explicit imports.
    DatabaseModule,
    ObservabilityPlaneModule,
    BridgeDatabaseModule,
    ProtocolModule,
    // Feature modules
    HealthModule,
    WellKnownModule,
    InboundModule,
    OutboundModule,
    SecurityModule,
    RegistryModule,
    StreamingModule,
    TrainingModule,
    MessagingModule,
    // Invoke — A2A entry point + dispatch
    BridgeInvokeModule,
  ],
  providers: [],
})
export class AppModule {}
