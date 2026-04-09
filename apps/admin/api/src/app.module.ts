import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { DatabaseModule } from '@orchestratorai/planes/database';
import { AuthModule } from './auth';
import { HealthModule } from './health/health.module';
import { LlmAnalyticsModule } from './llm-analytics/llm-analytics.module';
import { RagManagementModule } from './rag-management/rag-management.module';
import { AgentRegistryModule } from './agent-registry/agent-registry.module';
import { SystemConfigModule } from './system-config/system-config.module';
import { ClaudePaneModule } from './claude-pane/claude-pane.module';
import { DatabaseAdminModule } from './database-admin/database-admin.module';
import { CrawlerModule } from './crawler/crawler.module';

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

    // Auth layer — global, calls Auth API for token + permission checks
    AuthModule,

    // Health check — no auth required
    HealthModule,

    // Admin feature modules — all call product APIs via pass-through auth
    LlmAnalyticsModule,
    RagManagementModule,
    AgentRegistryModule,
    SystemConfigModule,

    // Claude Code Pane — shared dev tool for all enterprise products
    ClaudePaneModule,

    // Database administration — health, config, tables, migrations
    DatabaseAdminModule,

    // Crawler admin — sources, articles, crawl history
    CrawlerModule,
  ],
})
export class AppModule {}
