/**
 * Converse Actions (Conversation Operations)
 *
 * All operations use the unified A2A orchestrator which:
 * - Gets ExecutionContext from the store (agentSlug, conversationId, etc.)
 * - Builds JSON-RPC requests via request-switch
 * - Handles responses via response-switch
 * - Updates stores automatically
 *
 * @see docs/prd/unified-a2a-orchestrator.md
 */

import { a2aOrchestrator } from '../orchestrator';
import { useConversationsStore } from '@/stores/conversationsStore';
import { useChatUiStore } from '@/stores/ui/chatUiStore';
import { useExecutionContextStore } from '@/stores/executionContextStore';
import type { Conversation, Message, AgentType } from '@/stores/conversationsStore';
import type { HitlWaitingResult } from './build.actions';
import type { HitlGeneratedContent, HitlStatus } from '@orchestrator-ai/transport-types';

/**
 * Result from sendMessage - can be a normal message or HITL waiting
 */
export type SendMessageResult =
  | { type: 'message'; message: Message }
  | { type: 'hitl_waiting'; hitlResult: HitlWaitingResult };

// Match LangGraph customer-service history window to keep frontend + backend aligned.
// Max history window: 20 messages (10 turns), always preserving the first user message.
const HISTORY_WINDOW = 20;

function applyHistoryWindow(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (messages.length <= HISTORY_WINDOW) {
    return messages;
  }

  const firstUserMessage = messages.find((m) => m.role === 'user');
  const recentMessages = messages.slice(-HISTORY_WINDOW);

  if (
    firstUserMessage &&
    !recentMessages.some(
      (m) => m.role === 'user' && m.content === firstUserMessage.content,
    )
  ) {
    const withFirst = [firstUserMessage, ...recentMessages.slice(1)];
    return withFirst.slice(0, HISTORY_WINDOW);
  }

  return recentMessages;
}

/**
 * Send a message in converse mode
 *
 * @param userMessage - User's message content
 * @param documents - Optional file attachments
 * @param interactionMode - 'voice' triggers ultra-concise responses from the agent
 * @returns The assistant's response message or HITL waiting result
 */
export async function sendMessage(
  userMessage: string,
  documents?: Array<{ filename: string; mimeType: string; size: number; base64Data: string }>,
  interactionMode?: 'voice' | 'text',
): Promise<SendMessageResult> {
  const conversationsStore = useConversationsStore();
  const chatUiStore = useChatUiStore();
  const executionContextStore = useExecutionContextStore();
  const ctx = executionContextStore.current;

  try {
    chatUiStore.setIsSendingMessage(true);

    // Build conversation history from store BEFORE adding the current user message.
    // The backend expects `messages` to contain only prior turns; the current turn is sent as `userMessage`.
    const existingMessages = conversationsStore.messagesByConversation(
      ctx.conversationId,
    );
    const historyMessages = existingMessages
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));
    const messages = applyHistoryWindow(historyMessages);

    // Add user message to conversation
    conversationsStore.addMessage(ctx.conversationId, {
      conversationId: ctx.conversationId,
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    });

    // Create assistant message placeholder
    const assistantMessage = conversationsStore.addMessage(ctx.conversationId, {
      conversationId: ctx.conversationId,
      role: 'assistant',
      content: 'Thinking...',
      timestamp: new Date().toISOString(),
    });

    // Execute via orchestrator with conversation history
    const result = await a2aOrchestrator.execute('converse.send', { 
      userMessage, 
      messages, 
      documents, 
      interactionMode 
    });

    // Update assistant message based on result
    // Orchestrator returns MessageResult with message: string; we build a full Message for SendMessageResult
    if (result.type === 'message') {
      const responseText = result.message;
      conversationsStore.updateMessage(ctx.conversationId, assistantMessage.id, {
        content: responseText,
      });
      conversationsStore.updateMessageMetadata(ctx.conversationId, assistantMessage.id, {
        ...result.metadata,
      });

      chatUiStore.setIsSendingMessage(false);

      const message: Message = {
        ...assistantMessage,
        content: responseText,
        metadata: {
          ...assistantMessage.metadata,
          ...result.metadata,
        },
      };
      return { type: 'message', message };
    } else if (result.type === 'hitl_waiting') {
      // HITL waiting - agent forwarded converse to LangGraph and got HITL pause
      conversationsStore.updateMessage(ctx.conversationId, assistantMessage.id, {
        content: 'Content generated. Waiting for your review...',
      });
      conversationsStore.updateMessageMetadata(ctx.conversationId, assistantMessage.id, {
        taskId: result.taskId,
        custom: { hitlWaiting: true },
      });

      chatUiStore.setIsSendingMessage(false);

      return {
        type: 'hitl_waiting',
        hitlResult: {
          isHitlWaiting: true,
          taskId: result.taskId,
          topic: result.topic,
          status: 'hitl_waiting' as HitlStatus,
          generatedContent: result.generatedContent as HitlGeneratedContent,
          agentSlug: ctx.agentSlug,
          conversationId: ctx.conversationId,
        },
      };
    } else if (result.type === 'error') {
      conversationsStore.updateMessage(ctx.conversationId, assistantMessage.id, {
        content: `Error: ${result.error}`,
      });

      chatUiStore.setIsSendingMessage(false);
      throw new Error(result.error);
    }

    // Unexpected result type
    chatUiStore.setIsSendingMessage(false);
    throw new Error('Unexpected response type');
  } catch (error) {
    console.error('[Converse Send] Error:', error);
    chatUiStore.setIsSendingMessage(false);
    conversationsStore.setError(
      error instanceof Error ? error.message : 'Failed to send message',
    );
    throw error;
  }
}

/**
 * Create a new conversation
 *
 * @param agentName - Name of the agent
 * @param agentType - Type of the agent
 * @param organizationSlug - Organization slug
 * @param title - Optional conversation title
 * @returns The created conversation
 */
export async function createConversation(
  agentName: string,
  agentType: string,
  organizationSlug: string,
  title?: string,
): Promise<Conversation> {
  // Note: createConversation needs agentName, agentType, organizationSlug parameters
  // because these are used to SET the context, not read from it.
  // The context doesn't exist yet when creating a new conversation.

  // Use agent2AgentConversationsService to create conversation
  const agent2AgentConversationsService = await import('@/services/agent2AgentConversationsService');

  const response = await agent2AgentConversationsService.default.createConversation({
    agentName,
    agentType: agentType as import('@/services/agent2AgentConversationsService').AgentType,
    organizationSlug,
    metadata: {
      title: title || `Chat with ${agentName}`,
    },
  });

  const conversation: Conversation = {
    id: response.id,
    userId: '', // Will be set by backend
    title: title || `Chat with ${agentName}`,
    agentName,
    agentType: agentType as AgentType,
    organizationSlug,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const conversationsStore = useConversationsStore();
  conversationsStore.setConversation(conversation);

  const chatUiStore = useChatUiStore();
  chatUiStore.setActiveConversation(conversation.id);

  return conversation;
}

/**
 * Load conversation from backend
 *
 * @param conversationId - Conversation ID to load
 * @returns The loaded conversation with messages
 */
export async function loadConversation(
  conversationId: string,
): Promise<Conversation> {
  // This would call a backend API to load the conversation
  // For now, we'll just return what's in the store
  const conversationsStore = useConversationsStore();
  const conversation = conversationsStore.conversationById(conversationId);

  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  return conversation;
}

/**
 * Delete a conversation
 *
 * @param conversationId - Conversation ID to delete
 */
export async function deleteConversation(
  conversationId: string,
): Promise<void> {
  const conversationsStore = useConversationsStore();
  const chatUiStore = useChatUiStore();

  // Close the conversation tab if open
  chatUiStore.closeConversationTab(conversationId);

  // Remove from store
  conversationsStore.removeConversation(conversationId);
}
