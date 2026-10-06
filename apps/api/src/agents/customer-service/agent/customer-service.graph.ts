import { StateGraph, END } from '@langchain/langgraph';
import {
  CustomerServiceStateAnnotation,
  CustomerServiceState,
} from './customer-service.state';
import { createClassifyIntentNode } from './nodes/classify-intent.node';
import { createAnswerQuestionNode } from './nodes/answer-question.node';
import { createExplainPricingNode } from './nodes/explain-pricing.node';
import { createOfferDemoNode } from './nodes/offer-demo.node';
import { createProvideContactNode } from './nodes/provide-contact.node';
import { createRedirectNode } from './nodes/redirect.node';
import { createRespondNode } from './nodes/respond.node';
import { LLMHttpClientService } from '../../../workflows/shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../workflows/shared/services/observability.service';
import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { CompanyProfileLoader } from './company-profile';
import type { CompanyKnowledgeRetriever } from './company-knowledge.retriever';

/**
 * Customer Service Graph
 *
 * Intent-classification workflow with specialized response nodes:
 *
 * [START]
 *    |
 *    v
 * [start]  (loads the organization's company profile into state)
 *    |
 *    v
 * [classify_intent]
 *    |
 *    |-- general_question --> [answer_question] --> [respond]
 *    |-- pricing_inquiry  --> [explain_pricing] --> [respond]
 *    |-- schedule_demo    --> [offer_demo]      --> [respond]
 *    |-- need_help        --> [provide_contact]  --> [respond]
 *    |-- off_topic        --> [redirect]         --> [respond]
 *    |
 *    v
 * [respond] --> [END]
 */
export type CustomerServiceGraph = Awaited<
  ReturnType<typeof createCustomerServiceGraph>
>;

export async function createCustomerServiceGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: BaseCheckpointSaver,
  profileLoader: Pick<CompanyProfileLoader, 'load'>,
  retriever: Pick<CompanyKnowledgeRetriever, 'retrieve'>,
) {
  const classifyIntentNode = createClassifyIntentNode(llmClient, observability);
  const answerQuestionNode = createAnswerQuestionNode(
    llmClient,
    observability,
    retriever,
  );
  const explainPricingNode = createExplainPricingNode(
    llmClient,
    observability,
    retriever,
  );
  const offerDemoNode = createOfferDemoNode(observability);
  const provideContactNode = createProvideContactNode(observability);
  const redirectNode = createRedirectNode(llmClient, observability);
  const respondNode = createRespondNode(llmClient, observability);

  async function startNode(
    state: CustomerServiceState,
  ): Promise<Partial<CustomerServiceState>> {
    const ctx = state.executionContext;

    await observability.emitStarted(
      ctx,
      ctx.conversationId,
      `Starting customer service workflow: ${state.userMessage}`,
    );

    // Who the company is and how to reach it: once per invocation.
    const profile = await profileLoader.load(ctx);

    return {
      profile,
      status: 'processing',
      startedAt: Date.now(),
    };
  }

  async function handleErrorNode(
    state: CustomerServiceState,
  ): Promise<Partial<CustomerServiceState>> {
    const ctx = state.executionContext;

    await observability.emitFailed(
      ctx,
      ctx.conversationId,
      state.error || 'Unknown error',
      Date.now() - state.startedAt,
    );

    return {
      status: 'failed',
      completedAt: Date.now(),
    };
  }

  const graph = new StateGraph(CustomerServiceStateAnnotation)
    .addNode('start', startNode)
    .addNode('classify_intent', classifyIntentNode)
    .addNode('answer_question', answerQuestionNode)
    .addNode('explain_pricing', explainPricingNode)
    .addNode('offer_demo', offerDemoNode)
    .addNode('provide_contact', provideContactNode)
    .addNode('redirect', redirectNode)
    .addNode('respond', respondNode)
    .addNode('handle_error', handleErrorNode)
    // Entry
    .addEdge('__start__', 'start')
    .addEdge('start', 'classify_intent')
    // Route by intent after classification
    .addConditionalEdges('classify_intent', (state) => {
      if (state.error || state.status === 'failed') {
        return 'handle_error';
      }
      switch (state.intent) {
        case 'pricing_inquiry':
          return 'explain_pricing';
        case 'schedule_demo':
          return 'offer_demo';
        case 'need_help':
          return 'provide_contact';
        case 'off_topic':
          return 'redirect';
        case 'general_question':
        default:
          return 'answer_question';
      }
    })
    // All intent nodes flow to respond
    .addConditionalEdges('answer_question', (state) =>
      state.error || state.status === 'failed' ? 'handle_error' : 'respond',
    )
    .addConditionalEdges('explain_pricing', (state) =>
      state.error || state.status === 'failed' ? 'handle_error' : 'respond',
    )
    .addConditionalEdges('offer_demo', (state) =>
      state.error || state.status === 'failed' ? 'handle_error' : 'respond',
    )
    .addConditionalEdges('provide_contact', (state) =>
      state.error || state.status === 'failed' ? 'handle_error' : 'respond',
    )
    .addConditionalEdges('redirect', (state) =>
      state.error || state.status === 'failed' ? 'handle_error' : 'respond',
    )
    .addEdge('respond', END)
    .addEdge('handle_error', END);

  return graph.compile({ checkpointer });
}
