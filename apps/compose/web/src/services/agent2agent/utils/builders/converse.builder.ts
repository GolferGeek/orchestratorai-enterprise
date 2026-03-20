/**
 * Converse Request Builder
 * Creates fully-typed, validated converse requests
 *
 * **Store-First Approach (PRD Compliant):**
 * Each builder function gets context from the ExecutionContext store internally.
 * Context is NEVER passed as a parameter - builders access the store directly.
 *
 * @see docs/prd/unified-a2a-orchestrator.md - Phase 1, Item #2
 */

import type {
  StrictConverseRequest,
  AgentTaskMode,
  StrictTaskMessage,
} from '../../legacy-types';

/**
 * Payload type for converse action
 */
export interface ConverseSendPayload {
  userMessage: string;
  messages?: StrictTaskMessage[];
  documents?: Array<{
    filename: string;
    mimeType: string;
    size: number;
    base64Data: string;
  }>;
  interactionMode?: 'voice' | 'text';
}

/**
 * Validation helper
 */
function validateRequired(value: unknown, fieldName: string): void {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${fieldName} is required and cannot be empty`);
  }
}

/**
 * Converse request builder
 * Single action: send message
 *
 * **Store-First Approach:** Gets context from the store internally.
 * No metadata parameter - only action-specific payload data.
 */
export const converseBuilder = {
  /**
   * Send a conversation message
   */
  send: (payload: ConverseSendPayload): StrictConverseRequest => {
    validateRequired(payload.userMessage, 'userMessage');

    return {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'converse',
      params: {
        mode: 'converse' as AgentTaskMode,
        userMessage: payload.userMessage,
        messages: payload.messages || [],
        payload: {
          action: 'send',
          ...(payload.documents?.length ? { documents: payload.documents } : {}),
          ...(payload.interactionMode ? { interactionMode: payload.interactionMode } : {}),
        },
      },
    } as unknown as StrictConverseRequest;
  },
};
