import { CustomerServiceState, requireProfile } from '../customer-service.state';
import { buildCustomerServiceSystemPrompt } from '../prompts/system-prompt';
import {
  AGENT_SLUG,
  NodeLLMClient,
  NodeObservability,
} from './node-dependencies';

/**
 * Redirect Node
 *
 * Handles off_topic intent: politely says the assistant only helps with the
 * company's own questions and invites one.
 */
export function createRedirectNode(
  llmClient: NodeLLMClient,
  observability: NodeObservability,
) {
  return async function redirectNode(
    state: CustomerServiceState,
  ): Promise<Partial<CustomerServiceState>> {
    const ctx = state.executionContext;
    const profile = requireProfile(state);

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Redirecting off-topic message',
      { step: 'redirect', progress: 50 },
    );

    const redirectSystemPrompt = `${buildCustomerServiceSystemPrompt(profile)}

CURRENT FOCUS: The user's message is not about ${profile.name}. Politely say you can only help with questions about ${profile.name}, its products and its services, without being dismissive. Briefly mention what you can help with (questions about what ${profile.name} offers, prices, booking a meeting, getting in touch) and invite them to ask. Keep it short.`;

    const response = await llmClient.callLLM({
      context: ctx,
      systemMessage: redirectSystemPrompt,
      userMessage: state.userMessage,
      callerName: AGENT_SLUG,
      temperature: 0.7,
      maxTokens: 150,
    });

    return { nodeResponse: response.text };
  };
}
