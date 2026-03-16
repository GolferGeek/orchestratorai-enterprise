import { Module, Global } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { LLMHttpClientService } from './llm-http-client.service';
import { ObservabilityService } from './observability.service';
import { HITLHelperService } from './hitl-helper.service';
import { LLMUsageReporterService } from './llm-usage-reporter.service';
import { RagHttpClientService } from './rag-http-client.service';

/**
 * SharedServicesModule
 *
 * Global module that provides shared services for all LangGraph workflows.
 * These services handle communication with the Orchestrator AI API for:
 * - LLM calls (via /llm/generate)
 * - LLM usage reporting (via /llm/usage)
 * - Observability events (via /webhooks/status)
 * - HITL state management
 * - RAG queries (via /rag/internal/query)
 */
@Global()
@Module({
  imports: [
    HttpModule.register({
      timeout: 300000, // 5 minutes - no timeouts in production
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  providers: [
    LLMHttpClientService,
    ObservabilityService,
    HITLHelperService,
    LLMUsageReporterService,
    RagHttpClientService,
  ],
  exports: [
    LLMHttpClientService,
    ObservabilityService,
    HITLHelperService,
    LLMUsageReporterService,
    RagHttpClientService,
  ],
})
export class SharedServicesModule {}
