/**
 * BridgeInvokeModule
 *
 * Wires the BridgeInvokeController and BridgeDispatchService into the NestJS
 * module graph. Imports InboundModule and RegistryModule to access:
 * - A2ARouterService (inbound routing to Forge/Compose/Pulse)
 * - ExternalRegistryService (external agent registry and trust scoring)
 *
 * BridgeDatabaseService is available globally via BridgeDatabaseModule.
 * OBSERVABILITY_SERVICE is available globally via BridgeObservabilityModule.
 * ConfigService is available globally via ConfigModule.forRoot().
 */

import { Module } from '@nestjs/common';
import { BridgeInvokeController } from './invoke.controller';
import { BridgeDispatchService } from './bridge-dispatch.service';
import { InboundModule } from '../inbound/inbound.module';
import { RegistryModule } from '../registry/registry.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Module({
  imports: [InboundModule, RegistryModule],
  controllers: [BridgeInvokeController],
  providers: [BridgeDispatchService, JwtAuthGuard],
  exports: [BridgeDispatchService],
})
export class BridgeInvokeModule {}
