import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { DatabaseModule } from '@orchestratorai/planes/database';
import { ExtractorsModule } from '@orchestratorai/planes/extractors';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { LlmAnalyticsModule } from './llm-analytics/llm-analytics.module';
import { RagManagementModule } from './rag-management/rag-management.module';
import { AgentRegistryModule } from './agent-registry/agent-registry.module';
import { SystemConfigModule } from './system-config/system-config.module';
import { ClaudePaneModule } from './claude-pane/claude-pane.module';
import { DatabaseAdminModule } from './database-admin/database-admin.module';
import { ObservabilityModule } from './observability/observability.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        process.env['ENV_FILE'] ?? '',
        join(__dirname, '../../../.env'),
        join(__dirname, '../../../../.env'),
        join(process.cwd(), '.env'),
      ].filter(Boolean),
      expandVariables: true,
    }),

    // Database plane — global, selected by DB_PROVIDER env var
    DatabaseModule,

    // Extractors plane — global, provides PDF/DOCX/Text/etc. extractor services
    ExtractorsModule,

    // Auth layer — global, calls Auth API for token + permission checks
    AuthModule,

    // Health check — no auth required
    HealthModule,

    // Admin feature modules — all call product APIs via pass-through auth
    LlmAnalyticsModule,
    RagManagementModule,
    AgentRegistryModule,
    SystemConfigModule,
    ObservabilityModule,

    // Claude Code Pane — shared dev tool for all enterprise products
    ClaudePaneModule,

    // Database administration — health, config, tables, migrations
    DatabaseAdminModule,
  ],
})
export class AppModule {}
