import { CustomerServiceState } from '../customer-service.state';
import { answerFromCompanyKnowledge } from './grounded-answer';
import type {
  NodeKnowledgeRetriever,
  NodeLLMClient,
  NodeObservability,
} from './node-dependencies';

/**
 * Explain Pricing Node
 *
 * Handles pricing_inquiry intent: answers price questions only from the
 * organization's company-knowledge documents. Never quotes a price the
 * documents do not state; points to the contact details for quotes.
 */
export function createExplainPricingNode(
  llmClient: NodeLLMClient,
  observability: NodeObservability,
  retriever: NodeKnowledgeRetriever,
) {
  return async function explainPricingNode(
    state: CustomerServiceState,
  ): Promise<Partial<CustomerServiceState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Looking up pricing in company documents',
      { step: 'explain_pricing', progress: 50 },
    );

    const nodeResponse = await answerFromCompanyKnowledge(
      state,
      llmClient,
      retriever,
      {
        focus:
          'The user is asking about prices or costs. Give only prices the excerpts state, exactly as stated, with the document name. For anything not listed (custom quotes, discounts, bulk pricing), give the contact details instead of a number.',
        temperature: 0.2,
        maxTokens: 600,
      },
    );

    return { nodeResponse };
  };
}
