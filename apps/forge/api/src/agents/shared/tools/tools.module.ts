import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  SqlQueryTool,
  ListTablesTool,
  DescribeTableTool,
} from './data/database';

/**
 * ToolsModule
 *
 * Provides database tools for LangGraph agents.
 * These tools enable agents to:
 * - List available database tables
 * - Describe table schemas
 * - Execute SQL queries (read-only)
 *
 * Tools use Ollama/SQLCoder for SQL generation and report
 * usage via the LLMUsageReporterService.
 */
@Module({
  imports: [ConfigModule],
  providers: [SqlQueryTool, ListTablesTool, DescribeTableTool],
  exports: [SqlQueryTool, ListTablesTool, DescribeTableTool],
})
export class ToolsModule {}
