import { Module } from '@nestjs/common';
import { HrAssistantController } from './hr-assistant.controller';
import { HrAssistantService } from './hr-assistant.service';

/**
 * HrAssistantModule
 *
 * Provides the HR Assistant agent — a PATTERN_B (RAG Retrieve → LLM Call)
 * conversion of the rag-runner hr-assistant agent.
 *
 * SharedServicesModule (global) provides LLMHttpClientService,
 * RagHttpClientService, and ObservabilityService automatically.
 * PersistenceModule (global) provides PostgresCheckpointerService.
 */
@Module({
  controllers: [HrAssistantController],
  providers: [HrAssistantService],
  exports: [HrAssistantService],
})
export class HrAssistantModule {}
