/**
 * Forge Invoke Module V2
 *
 * Module-first, A2A-native entry point for Forge capabilities.
 * Capability modules register themselves with the CapabilityRegistryService.
 *
 * OBSERVABILITY_SERVICE is provided globally by ObservabilityPlaneModule.
 *
 * Entry point for all Forge capability invocations.
 */

import { Module } from '@nestjs/common';
import { ForgeInvokeController } from './invoke.controller';
import { CapabilityRegistryService } from './capability-registry.service';
import { DiscoveryController } from './discovery.controller';

@Module({
  controllers: [ForgeInvokeController, DiscoveryController],
  providers: [CapabilityRegistryService],
  exports: [CapabilityRegistryService],
})
export class ForgeInvokeModule {}
