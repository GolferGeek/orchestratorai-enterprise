import { CustomerServiceState } from '../customer-service.state';
import { answerFromCompanyKnowledge } from './grounded-answer';
import type {
  NodeKnowledgeRetriever,
  NodeLLMClient,
  NodeObservability,
} from './node-dependencies';

/**
 * Answer Question Node
 *
 * Handles general_question intent: answers from the organization's
 * company-knowledge documents, citing them.
 */
export function createAnswerQuestionNode(
  llmClient: NodeLLMClient,
  observability: NodeObservability,
  retriever: NodeKnowledgeRetriever,
) {
  return async function answerQuestionNode(
    state: CustomerServiceState,
  ): Promise<Partial<CustomerServiceState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Answering question from company documents',
      { step: 'answer_question', progress: 50 },
    );

    const nodeResponse = await answerFromCompanyKnowledge(
      state,
      llmClient,
      retriever,
      {
        focus:
          'The user has a question about the company, its products or its services.',
        temperature: 0.3,
        maxTokens: 600,
      },
    );

    return { nodeResponse };
  };
}
