/**
 * Forge Invoke Module V2
 *
 * Module-first, A2A-native entry point for Forge capabilities.
 * Capability modules register themselves with the CapabilityRegistryService.
 *
 * Entry point for all Forge capability invocations.
 */

import { Module } from '@nestjs/common';
import { ForgeInvokeController } from './invoke.controller';
import { CapabilityRegistryService } from './capability-registry.service';
import { DiscoveryController } from './discovery.controller';
import { ObservabilityPlaneModule } from '@/observability/observability-plane';

@Module({
  imports: [ObservabilityPlaneModule],
  controllers: [ForgeInvokeController, DiscoveryController],
  providers: [CapabilityRegistryService],
  exports: [CapabilityRegistryService],
})
export class ForgeInvokeModule {}
