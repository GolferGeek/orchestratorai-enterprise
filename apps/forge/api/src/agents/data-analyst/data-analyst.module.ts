import { Module } from '@nestjs/common';
import { DataAnalystController } from './data-analyst.controller';
import { DataAnalystService } from './data-analyst.service';
import { ToolsModule } from '../shared/tools/tools.module';

/**
 * DataAnalystModule
 *
 * Provides the Data Analyst agent for answering questions about data
 * using SQL queries. The agent:
 * - Discovers available database tables
 * - Examines table schemas
 * - Generates and executes SQL queries
 * - Summarizes results in natural language
 */
@Module({
  imports: [ToolsModule],
  controllers: [DataAnalystController],
  providers: [DataAnalystService],
  exports: [DataAnalystService],
})
export class DataAnalystModule {}
