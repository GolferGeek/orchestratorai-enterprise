import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import { ExecutionContext } from '@orchestrator-ai/transport-types';

export type CustomerServiceIntent =
  | 'general_question'
  | 'pricing_inquiry'
  | 'schedule_demo'
  | 'need_help'
  | 'off_topic';

export type InteractionMode = 'text' | 'voice';

/**
 * Input to the customer service workflow
 */
export interface CustomerServiceInput {
  context: ExecutionContext;
  userMessage: string;
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  interactionMode?: InteractionMode;
}

/**
 * Result from customer service workflow execution
 */
export interface CustomerServiceResult {
  taskId: string;
  status: 'completed' | 'failed';
  userMessage: string;
  response?: string;
  intent?: CustomerServiceIntent;
  error?: string;
  duration: number;
}

/**
 * Status response for checking thread state
 */
export interface CustomerServiceStatus {
  taskId: string;
  status: CustomerServiceState['status'];
  userMessage: string;
  response?: string;
  error?: string;
}

/**
 * Customer Service State Annotation
 *
 * ExecutionContext flows through the entire graph in state.
 * interactionMode is used by the respond node to adjust response length
 * (voice = 2-3 sentences max, text = more detailed but still concise).
 */
export const CustomerServiceStateAnnotation = Annotation.Root({
  // Message history from LangGraph
  ...MessagesAnnotation.spec,

  // ExecutionContext - flows through all nodes, never constructed here
  executionContext: Annotation<ExecutionContext>({
    reducer: (_, next) => next,
    default: () => ({
      orgSlug: '',
      userId: '',
      conversationId: '',
      taskId: '',
      planId: '',
      deliverableId: '',
      agentSlug: '',
      agentType: '',
      provider: '',
      model: '',
    }),
  }),

  // User's current message
  userMessage: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // Conversation history (user + assistant turns from previous messages)
  // Window: last 20 messages (10 turns), always keep first user message
  conversationHistory: Annotation<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // Interaction mode — voice responses are ultra-concise (2-3 sentences)
  interactionMode: Annotation<InteractionMode>({
    reducer: (_, next) => next,
    default: () => 'text',
  }),

  // Intent classified by classify_intent node
  intent: Annotation<CustomerServiceIntent | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Node-specific response content (set by the intent-specific node)
  nodeResponse: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Final formatted response (set by respond node)
  response: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Status tracking
  status: Annotation<'started' | 'processing' | 'completed' | 'failed'>({
    reducer: (_, next) => next,
    default: () => 'started',
  }),

  error: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Workflow timing
  startedAt: Annotation<number>({
    reducer: (_, next) => next,
    default: () => Date.now(),
  }),

  completedAt: Annotation<number | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
});

export type CustomerServiceState = typeof CustomerServiceStateAnnotation.State;
