import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AgentRegistryModule } from './agent-registry/agent-registry.module';
import { ClaudePaneModule } from './claude-pane/claude-pane.module';
import { DatabaseAdminModule } from './database-admin/database-admin.module';
import { LlmAnalyticsModule } from './llm-analytics/llm-analytics.module';
import { McpAdminModule } from './mcp/mcp-admin.module';
import { ObservabilityModule } from './observability/observability.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { RagManagementModule } from './rag-management/rag-management.module';
import { SystemConfigModule } from './system-config/system-config.module';

@Module({
  imports: [
    OrganizationsModule,
    LlmAnalyticsModule,
    RagManagementModule,
    AgentRegistryModule,
    ObservabilityModule,
    SystemConfigModule,
    DatabaseAdminModule,
    McpAdminModule,
    ClaudePaneModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
