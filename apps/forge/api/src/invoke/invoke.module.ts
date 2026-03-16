/**
 * Forge Invoke Module V2
 *
 * Module-first, A2A-native entry point for Forge capabilities.
 * Capability modules register themselves with the CapabilityRegistryService.
 *
 * Replaces the mode-heavy agent2agent module for the v2 contract.
 */

import { Module } from '@nestjs/common';
import { ForgeInvokeController } from './invoke.controller';
import { CapabilityRegistryService } from './capability-registry.service';

@Module({
  controllers: [ForgeInvokeController],
  providers: [CapabilityRegistryService],
  exports: [CapabilityRegistryService],
})
export class ForgeInvokeModule {}
