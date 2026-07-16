import { CustomerServiceState } from '../customer-service.state';
import { ObservabilityService } from '../../../../workflows/shared/services/observability.service';

/**
 * Explain Pricing Node
 *
 * Handles pricing_inquiry intent.
 * Explains pricing tiers from the knowledge base. Never commits to custom pricing
 * beyond published tiers — directs to contact for quotes.
 */
export function createExplainPricingNode(
  observability: ObservabilityService,
) {
  return async function explainPricingNode(
    state: CustomerServiceState,
  ): Promise<Partial<CustomerServiceState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Explaining pricing options',
      { step: 'explain_pricing', progress: 50 },
    );

    return {
      nodeResponse:
        'OrchestratorAI is currently offered through a partnership model, not a self-serve price sheet. The two paths are a focused Pilot Program to prove value with real agents and workflows, and a Full Partnership for a broader build-out of your AI platform. Specific pricing depends on the workflows, integrations, data, deployment, security, and model/provider requirements. The best next step is to schedule a conversation with the team or email hello@orchestrator-ai.com.',
    };
  };
}
