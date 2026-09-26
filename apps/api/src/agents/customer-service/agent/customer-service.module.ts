import { Module } from '@nestjs/common';
import { CustomerServiceService } from './customer-service.service';

/**
 * CustomerServiceModule (LangGraph Agent)
 *
 * Provides the Customer Service agent — an intent-classification workflow
 * that answers product questions, explains pricing, schedules demos,
 * and provides contact info.
 *
 * SharedServicesModule (global) provides LLMHttpClientService and ObservabilityService.
 * The checkpointer plane (global) provides CHECKPOINT_SAVER.
 *
 * This module is registered in LanggraphAgentRunnerService's service registry
 * and invoked directly via ModuleRef — no HTTP round-trips.
 */
@Module({
  providers: [CustomerServiceService],
  exports: [CustomerServiceService],
})
export class CustomerServiceAgentModule {}
