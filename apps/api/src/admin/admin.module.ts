import { Module } from '@nestjs/common';
import { AgentRegistryModule } from './agent-registry/agent-registry.module';
import { ClaudePaneModule } from './claude-pane/claude-pane.module';
import { DatabaseAdminModule } from './database-admin/database-admin.module';
import { LlmAnalyticsModule } from './llm-analytics/llm-analytics.module';
import { McpAdminModule } from './mcp/mcp-admin.module';
import { ObservabilityModule } from './observability/observability.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { SystemConfigModule } from './system-config/system-config.module';

@Module({
  imports: [
    OrganizationsModule,
    LlmAnalyticsModule,
    AgentRegistryModule,
    ObservabilityModule,
    SystemConfigModule,
    DatabaseAdminModule,
    McpAdminModule,
    ClaudePaneModule,
  ],
})
export class AdminModule {}
