/**
 * Agent Registry Module
 *
 * Provides agent discovery (GET /agents) and conversation management
 * (POST /agent-conversations) endpoints for the Forge frontend.
 *
 * Replaces the removed agent-platform module's public endpoints.
 */

import { Module } from '@nestjs/common';
import { AgentRegistryController } from './agent-registry.controller';
import { AgentRegistryService } from './agent-registry.service';

@Module({
  controllers: [AgentRegistryController],
  providers: [AgentRegistryService],
  exports: [AgentRegistryService],
})
export class AgentRegistryModule {}
