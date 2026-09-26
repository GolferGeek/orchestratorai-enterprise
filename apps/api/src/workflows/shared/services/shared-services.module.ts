import { Module, Global } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { LLMHttpClientService } from './llm-http-client.service';
import { ObservabilityService } from './observability.service';
import { LLMUsageReporterService } from './llm-usage-reporter.service';
import { WorkflowRagService } from './workflow-rag.service';
import { RagModule } from '../../../rag/rag.module';
/**
 * SharedServicesModule
 *
 * Global module that provides shared services for all LangGraph workflows.
 * These services handle communication with the Orchestrator AI API for:
 * - LLM calls (via /llm/generate)
 * - LLM usage reporting (via /llm/usage)
 * - Observability events (via /webhooks/status)
 */
@Global()
@Module({
  imports: [
    HttpModule.register({
      timeout: 300000, // 5 minutes - no timeouts in production
      maxRedirects: 5,
    }),
    ConfigModule,
    RagModule,
  ],
  providers: [
    LLMHttpClientService,
    ObservabilityService,
    LLMUsageReporterService,
    WorkflowRagService,
  ],
  exports: [
    LLMHttpClientService,
    ObservabilityService,
    LLMUsageReporterService,
    WorkflowRagService,
  ],
})
export class SharedServicesModule {}
