import type { LLMHttpClientService } from '../../../../workflows/shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../workflows/shared/services/observability.service';
import type { CompanyKnowledgeRetriever } from '../company-knowledge.retriever';
import type { CustomerServiceState } from '../customer-service.state';

/** The parts of the shared services the customer-service nodes use. */
export type NodeLLMClient = Pick<LLMHttpClientService, 'callLLM'>;
export type NodeObservability = Pick<ObservabilityService, 'emitProgress'>;
export type NodeKnowledgeRetriever = Pick<CompanyKnowledgeRetriever, 'retrieve'>;

export const AGENT_SLUG = 'customer-service';

/** Prior turns plus the current message, as plain "User:/Assistant:" lines. */
export function withHistory(state: CustomerServiceState): string {
  const historyLines = state.conversationHistory
    .map(
      (msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`,
    )
    .join('\n');
  return historyLines
    ? `${historyLines}\n\nUser: ${state.userMessage}`
    : state.userMessage;
}
