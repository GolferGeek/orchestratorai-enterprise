import { CustomerServiceState } from '../customer-service.state';
import { ObservabilityService } from '../../shared/services/observability.service';

/**
 * Offer Demo Node
 *
 * Handles schedule_demo intent.
 * Provides scheduling guidance and contact information.
 * No LLM call needed — this is a fixed, high-confidence response.
 */
export function createOfferDemoNode(observability: ObservabilityService) {
  return async function offerDemoNode(
    state: CustomerServiceState,
  ): Promise<Partial<CustomerServiceState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Providing demo scheduling information',
      { step: 'offer_demo', progress: 50 },
    );

    const response =
      "I'd love to set that up! You can schedule a demo directly at our website — just look for the 'Book a Demo' option. Or reach out to us at hello@orchestrator-ai.com and we'll get something on the calendar right away. You can also call us at 763-220-0146.";

    return {
      nodeResponse: response,
    };
  };
}
