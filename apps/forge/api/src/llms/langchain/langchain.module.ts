import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LLMModule } from '@/llms/llm.module';

// Core LangChain services
import { LangChainNotionService } from './services/notion-tools.service';
import { LangChainClientService } from './services/langchain-client.service';

/**
 * LangChain Module
 *
 * Provides LangChain.js integration for agent-based workflows including:
 * - Supabase/PostgreSQL operations with natural language queries
 * - Notion API tool integration
 * - Core LangChain orchestration
 *
 * Note: Database-specific services (SupabaseToolsService) are separate from
 * the main app services to allow for multiple database type support.
 */
@Module({
  imports: [
    HttpModule, // For HTTP-based tools and integrations
    forwardRef(() => LLMModule), // For language model access (circular dependency resolution)
  ],
  providers: [LangChainNotionService, LangChainClientService],
  exports: [LangChainNotionService, LangChainClientService],
})
export class LangChainModule {}
