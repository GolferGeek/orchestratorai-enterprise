import {
  CustomerServiceState,
  CustomerServiceIntent,
} from '../customer-service.state';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../shared/services/observability.service';
import { CLASSIFY_INTENT_SYSTEM_PROMPT } from '../prompts/system-prompt';

const AGENT_SLUG = 'customer-service';

const VALID_INTENTS: CustomerServiceIntent[] = [
  'general_question',
  'pricing_inquiry',
  'schedule_demo',
  'need_help',
  'off_topic',
];

/**
 * Classify Intent Node
 *
 * Determines user intent from their message + conversation history.
 * Multi-turn context is handled naturally by including history in the prompt —
 * ambiguous follow-ups route to the same intent as the previous exchange.
 */
export function createClassifyIntentNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function classifyIntentNode(
    state: CustomerServiceState,
  ): Promise<Partial<CustomerServiceState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.taskId,
      'Classifying user intent',
      { step: 'classify_intent', progress: 20 },
    );

    // Build conversation history context for the LLM
    const historyLines = state.conversationHistory
      .map(
        (msg) =>
          `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`,
      )
      .join('\n');

    const userMessageWithHistory = historyLines
      ? `Conversation history:\n${historyLines}\n\nCurrent message: ${state.userMessage}`
      : state.userMessage;

    const response = await llmClient.callLLM({
      context: ctx,
      systemMessage: CLASSIFY_INTENT_SYSTEM_PROMPT,
      userMessage: userMessageWithHistory,
      callerName: AGENT_SLUG,
      temperature: 0.1, // Low temperature for consistent classification
      maxTokens: 20,
    });

    const rawIntent = response.text
      .trim()
      .toLowerCase() as CustomerServiceIntent;
    const intent = VALID_INTENTS.includes(rawIntent)
      ? rawIntent
      : 'general_question';

    await observability.emitProgress(
      ctx,
      ctx.taskId,
      `Intent classified: ${intent}`,
      { step: 'classify_intent_complete', progress: 30, intent },
    );

    return {
      intent,
      status: 'processing',
    };
  };
}
