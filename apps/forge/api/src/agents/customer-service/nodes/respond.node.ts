import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { CustomerServiceState } from '../customer-service.state';
import { ObservabilityService } from '../../shared/services/observability.service';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { CUSTOMER_SERVICE_SYSTEM_PROMPT } from '../prompts/system-prompt';

const AGENT_SLUG = 'customer-service';

// Voice responses are capped to keep TTS manageable.
// Use character length instead of sentence count to avoid boundary ambiguity
// (abbreviations like "Dr.", ellipses "...", missing punctuation, newlines).
const VOICE_MAX_CHARS = 360; // ~2–3 average sentences

/**
 * Normalize text for length check: trim and collapse whitespace (including newlines).
 */
function normalizeForVoiceLength(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Respond Node
 *
 * Final formatting node. Takes the nodeResponse set by the intent-specific node
 * and adjusts it based on interactionMode:
 * - voice: ultra-concise, 2-3 sentences max (enforced by character cap)
 * - text: use as-is (already reasonably concise from the intent nodes)
 *
 * For voice mode, if the response is already short it passes through unchanged.
 * If it's long, it asks the LLM to condense it.
 */
export function createRespondNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function respondNode(
    state: CustomerServiceState,
  ): Promise<Partial<CustomerServiceState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Formatting final response',
      { step: 'respond', progress: 85 },
    );

    if (state.nodeResponse === undefined || state.nodeResponse === null) {
      throw new Error(
        'Respond node: state.nodeResponse was not set by a previous node. An intent node must set nodeResponse before the respond node runs.',
      );
    }
    const rawResponse = state.nodeResponse;

    let finalResponse = rawResponse;

    // Voice mode: condense to ~2-3 sentences if the response is long.
    // Length-based check avoids sentence-boundary bugs (Dr., ellipses, no final punctuation).
    if (state.interactionMode === 'voice') {
      const normalized = normalizeForVoiceLength(rawResponse);

      if (normalized.length > VOICE_MAX_CHARS) {
        const condensedResponse = await llmClient.callLLM({
          context: ctx,
          systemMessage: `${CUSTOMER_SERVICE_SYSTEM_PROMPT}

TASK: Condense the following response to 2-3 short sentences for voice output. Preserve the most important information. Keep it natural and conversational — this will be spoken aloud.`,
          userMessage: rawResponse,
          callerName: AGENT_SLUG,
          temperature: 0.3,
          maxTokens: 200,
        });
        finalResponse = condensedResponse.text;
      }
    }

    await observability.emitCompleted(
      ctx,
      ctx.conversationId,
      { intent: state.intent, interactionMode: state.interactionMode },
      Date.now() - state.startedAt,
    );

    return {
      response: finalResponse,
      status: 'completed',
      completedAt: Date.now(),
      messages: [
        ...state.messages,
        new HumanMessage(state.userMessage),
        new AIMessage(finalResponse),
      ],
    };
  };
}
