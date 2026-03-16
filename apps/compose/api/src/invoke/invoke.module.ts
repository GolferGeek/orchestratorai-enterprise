/**
 * Invoke Module V2
 *
 * The new Compose entry point. Provides:
 * - InvokeController (POST /invoke, POST /invoke/stream)
 * - InvokeDispatchService (family-based runner dispatch)
 * - AgentDefinitionService (v2 agent resolution)
 * - FamilyRunnersModule (registers all 5 family runners on startup)
 * - OBSERVABILITY_SERVICE provider (via ObservabilityAdapterService)
 *
 * Replaces the mode-heavy agent2agent module for the v2 contract.
 */

import { Module } from '@nestjs/common';
import { InvokeController } from './invoke.controller';
import { InvokeDispatchService } from './invoke-dispatch.service';
import { AgentDefinitionService } from './agent-definition.service';
import { FamilyRunnersModule } from './runners/family-runners.module';
import { OBSERVABILITY_SERVICE } from '@/observability/observability-plane';
import { ObservabilityAdapterService } from '@/observability/observability-adapter.service';
import { ObservabilityModule } from '@/observability/observability.module';

@Module({
  imports: [
    ObservabilityModule,
    FamilyRunnersModule,
  ],
  controllers: [InvokeController],
  providers: [
    InvokeDispatchService,
    AgentDefinitionService,
    ObservabilityAdapterService,
    {
      provide: OBSERVABILITY_SERVICE,
      useExisting: ObservabilityAdapterService,
    },
  ],
  exports: [InvokeDispatchService, AgentDefinitionService],
})
export class InvokeModule {}
