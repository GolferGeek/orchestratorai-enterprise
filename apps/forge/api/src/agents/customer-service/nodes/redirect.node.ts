import { CustomerServiceState } from '../customer-service.state';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../shared/services/observability.service';
import { CUSTOMER_SERVICE_SYSTEM_PROMPT } from '../prompts/system-prompt';

const AGENT_SLUG = 'customer-service';

/**
 * Redirect Node
 *
 * Handles off_topic intent.
 * Gently brings off-topic messages back to Orchestrator AI without being rude.
 * Acknowledges the message briefly, then pivots to what the assistant can help with.
 */
export function createRedirectNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function redirectNode(
    state: CustomerServiceState,
  ): Promise<Partial<CustomerServiceState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Redirecting off-topic message',
      { step: 'redirect', progress: 50 },
    );

    const redirectSystemPrompt = `${CUSTOMER_SERVICE_SYSTEM_PROMPT}

CURRENT FOCUS: The user's message is off-topic — not related to Orchestrator AI. Politely acknowledge that you can only help with Orchestrator AI questions, without being dismissive or snarky. Briefly mention what you can help with (product questions, pricing, demos, support) and invite them to ask. Keep it short.`;

    const response = await llmClient.callLLM({
      context: ctx,
      systemMessage: redirectSystemPrompt,
      userMessage: state.userMessage,
      callerName: AGENT_SLUG,
      temperature: 0.7,
      maxTokens: 150,
    });

    return {
      nodeResponse: response.text,
    };
  };
}
