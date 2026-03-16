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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global infrastructure — must come before feature modules so injected
    // providers are available everywhere without explicit imports
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
  ],
})
export class AppModule {}
