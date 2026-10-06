import { Module } from '@nestjs/common';
import { CustomerServiceService } from './customer-service.service';
import { CompanyProfileLoader } from './company-profile';
import { CompanyKnowledgeRetriever } from './company-knowledge.retriever';

/**
 * CustomerServiceModule (LangGraph Agent)
 *
 * Provides the Customer Service agent — an intent-classification workflow
 * that speaks for one organization (context.orgSlug): it answers questions
 * and pricing from that organization's company-knowledge documents, and
 * gives its booking link and contact details from organizations.settings.
 *
 * SharedServicesModule (global) provides LLMHttpClientService and ObservabilityService.
 * The checkpointer plane (global) provides CHECKPOINT_SAVER; the database
 * plane (global) DATABASE_SERVICE; RagStorageModule (global) CollectionsService
 * and QueryService.
 *
 * This module is registered in LanggraphAgentRunnerService's service registry
 * and invoked directly via ModuleRef — no HTTP round-trips.
 */
@Module({
  providers: [
    CustomerServiceService,
    CompanyProfileLoader,
    CompanyKnowledgeRetriever,
  ],
  exports: [CustomerServiceService],
})
export class CustomerServiceAgentModule {}
