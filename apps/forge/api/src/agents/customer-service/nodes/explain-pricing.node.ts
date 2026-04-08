import { CustomerServiceState } from '../customer-service.state';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../shared/services/observability.service';
import { CUSTOMER_SERVICE_SYSTEM_PROMPT } from '../prompts/system-prompt';

const AGENT_SLUG = 'customer-service';

/**
 * Explain Pricing Node
 *
 * Handles pricing_inquiry intent.
 * Explains pricing tiers from the knowledge base. Never commits to custom pricing
 * beyond published tiers — directs to contact for quotes.
 */
export function createExplainPricingNode(
  llmClient: LLMHttpClientService,
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

    const pricingSystemPrompt = `${CUSTOMER_SERVICE_SYSTEM_PROMPT}

CURRENT FOCUS: The user is asking about pricing. Explain our pricing tiers clearly and concisely. For anything beyond published tiers or volume/custom pricing, direct them to contact us at hello@orchestrator-ai.com or schedule a demo. Never commit to specific pricing not described in your knowledge.`;

    const historyLines = state.conversationHistory
      .map(
        (msg) =>
          `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`,
      )
      .join('\n');

    const userMessageWithHistory = historyLines
      ? `${historyLines}\n\nUser: ${state.userMessage}`
      : state.userMessage;

    const response = await llmClient.callLLM({
      context: ctx,
      systemMessage: pricingSystemPrompt,
      userMessage: userMessageWithHistory,
      callerName: `${AGENT_SLUG}:explain-pricing`,
      temperature: 0.5,
      maxTokens: 500,
    });

    return {
      nodeResponse: response.text,
    };
  };
}
