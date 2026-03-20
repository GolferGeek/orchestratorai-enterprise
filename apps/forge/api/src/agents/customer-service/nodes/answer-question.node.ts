import { CustomerServiceState } from '../customer-service.state';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../shared/services/observability.service';
import { CUSTOMER_SERVICE_SYSTEM_PROMPT } from '../prompts/system-prompt';

const AGENT_SLUG = 'customer-service';

/**
 * Answer Question Node
 *
 * Handles general_question intent.
 * Answers product questions grounded in the knowledge base baked into the system prompt.
 */
export function createAnswerQuestionNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function answerQuestionNode(
    state: CustomerServiceState,
  ): Promise<Partial<CustomerServiceState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Answering product question',
      { step: 'answer_question', progress: 50 },
    );

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
      systemMessage: CUSTOMER_SERVICE_SYSTEM_PROMPT,
      userMessage: userMessageWithHistory,
      callerName: AGENT_SLUG,
      temperature: 0.7,
      maxTokens: 600,
    });

    return {
      nodeResponse: response.text,
    };
  };
}
