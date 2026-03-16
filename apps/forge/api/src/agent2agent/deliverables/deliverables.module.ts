import { Module, forwardRef } from '@nestjs/common';
import { DeliverablesService } from './deliverables.service';
import { DeliverablesController } from './deliverables.controller';
import { DeliverableVersionsService } from './deliverable-versions.service';
import { DeliverableVersionsController } from './deliverable-versions.controller';
import { AgentConversationsModule } from '@/agent2agent/conversations/agent-conversations.module';
import { LLMModule } from '@/llms/llm.module';
import { DeliverableDiscoveryRegistry } from './discovery/deliverable-discovery-registry.service';
import { MarketingSwarmDiscoveryService } from './discovery/marketing-swarm-discovery.service';
import { CadAgentDiscoveryService } from './discovery/cad-agent-discovery.service';
import { LegalDepartmentDiscoveryService } from './discovery/legal-department-discovery.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    AgentConversationsModule,
    forwardRef(() => LLMModule),
    ConfigModule,
  ],
  controllers: [DeliverablesController, DeliverableVersionsController],
  providers: [
    DeliverablesService,
    DeliverableVersionsService,
    DeliverableDiscoveryRegistry,
    MarketingSwarmDiscoveryService,
    CadAgentDiscoveryService,
    LegalDepartmentDiscoveryService,
  ],
  exports: [
    DeliverablesService,
    DeliverableVersionsService,
    DeliverableDiscoveryRegistry,
  ],
})
export class DeliverablesModule {}
