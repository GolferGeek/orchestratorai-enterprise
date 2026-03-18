/**
 * Invoke Module V2
 *
 * The new Compose entry point. Provides:
 * - InvokeController (POST /invoke, POST /invoke/stream)
 * - InvokeDispatchService (family-based runner dispatch)
 * - AgentDefinitionService (v2 agent resolution)
 * - FamilyRunnersModule (registers all 5 family runners on startup)
 *
 * OBSERVABILITY_SERVICE is provided globally by ObservabilityPlaneModule.
 *
 * Replaces the mode-heavy agent2agent module for the v2 contract.
 */

import { Module } from '@nestjs/common';
import { InvokeController } from './invoke.controller';
import { InvokeDispatchService } from './invoke-dispatch.service';
import { AgentDefinitionService } from './agent-definition.service';
import { ProvidersModelsService } from './providers-models.service';
import { ConversationsService } from './conversations.service';
import { FamilyRunnersModule } from './runners/family-runners.module';

@Module({
  imports: [FamilyRunnersModule],
  controllers: [InvokeController],
  providers: [InvokeDispatchService, AgentDefinitionService, ProvidersModelsService, ConversationsService],
  exports: [InvokeDispatchService, AgentDefinitionService, ProvidersModelsService, ConversationsService],
})
export class InvokeModule {}
