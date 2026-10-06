import { CustomerServiceState, requireProfile } from '../customer-service.state';
import {
  buildGroundedAnswerSystemPrompt,
  buildNotFoundReply,
} from '../prompts/system-prompt';
import {
  AGENT_SLUG,
  NodeKnowledgeRetriever,
  NodeLLMClient,
  withHistory,
} from './node-dependencies';

/**
 * The text searched in the company documents: the current message, preceded
 * by the previous user message so follow-ups ("how much is that?") still
 * find the thing they refer to.
 */
export function buildRetrievalQuery(state: CustomerServiceState): string {
  const previousUser = [...state.conversationHistory]
    .reverse()
    .find((msg) => msg.role === 'user');
  return previousUser
    ? `${previousUser.content}\n${state.userMessage}`
    : state.userMessage;
}

/**
 * Answer from the organization's company-knowledge documents. No excerpts is
 * a real outcome: say so and give the contact email, without calling the LLM.
 */
export async function answerFromCompanyKnowledge(
  state: CustomerServiceState,
  llmClient: NodeLLMClient,
  retriever: NodeKnowledgeRetriever,
  options: { focus: string; temperature: number; maxTokens: number },
): Promise<string> {
  const ctx = state.executionContext;
  const profile = requireProfile(state);

  const excerpts = await retriever.retrieve(ctx, buildRetrievalQuery(state));
  if (excerpts.length === 0) {
    return buildNotFoundReply(profile);
  }

  const response = await llmClient.callLLM({
    context: ctx,
    systemMessage: buildGroundedAnswerSystemPrompt(
      profile,
      excerpts,
      options.focus,
    ),
    userMessage: withHistory(state),
    callerName: AGENT_SLUG,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
  });
  return response.text;
}
