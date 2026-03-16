import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from '../auth/auth.module';
import { MarketingController } from './marketing.controller';
import { MarketingService } from './marketing.service';
import { MarketingDatabaseService } from './marketing-database.service';

/**
 * Marketing Module
 *
 * Provides configuration endpoints for the Marketing Swarm UI:
 * - Content types (blog posts, social media, etc.)
 * - Marketing agents (writers, editors, evaluators)
 * - LLM configurations for each agent
 *
 * Data is stored in the `marketing` schema in PostgreSQL.
 * Database access is provided by the global DatabaseModule via DATABASE_SERVICE.
 * All SQL queries use fully-qualified `marketing.<table>` names.
 */
@Module({
  imports: [AuthModule, HttpModule],
  controllers: [MarketingController],
  providers: [MarketingDatabaseService, MarketingService],
  exports: [MarketingService, MarketingDatabaseService],
})
export class MarketingModule {}
