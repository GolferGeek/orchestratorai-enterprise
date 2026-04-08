import { CustomerServiceState } from '../customer-service.state';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../shared/services/observability.service';
import { CUSTOMER_SERVICE_SYSTEM_PROMPT } from '../prompts/system-prompt';

const AGENT_SLUG = 'customer-service';

/**
 * Provide Contact Node
 *
 * Handles need_help intent.
 * Gives email and phone when the agent can't help, or when the user
 * explicitly asks for a human. Empathetic, not dismissive.
 */
export function createProvideContactNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function provideContactNode(
    state: CustomerServiceState,
  ): Promise<Partial<CustomerServiceState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Providing contact information',
      { step: 'provide_contact', progress: 50 },
    );

    const contactSystemPrompt = `${CUSTOMER_SERVICE_SYSTEM_PROMPT}

CURRENT FOCUS: The user needs more help than I can provide, or wants to speak with a human. Acknowledge their need warmly, let them know I'm an AI, and provide our contact information: email hello@orchestrator-ai.com and phone 763-220-0146. Be empathetic and make it easy for them to reach us.`;

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
      systemMessage: contactSystemPrompt,
      userMessage: userMessageWithHistory,
      callerName: `${AGENT_SLUG}:provide-contact`,
      temperature: 0.7,
      maxTokens: 300,
    });

    return {
      nodeResponse: response.text,
    };
  };
}
