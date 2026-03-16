/**
 * Converse Response Handler
 * Validates and processes converse-specific responses
 */

// import type { StrictConverseResponse } from '@orchestrator-ai/transport-types';
import {
  isStrictConverseResponse,
  validateSuccessResponse,
  extractSuccessPayload,
  StrictResponseValidationError,
} from './response-validation';
import { useConversationsStore } from '@/stores/conversationsStore';

/**
 * RAG Source type for attributed responses
 */
export interface RagSource {
  document: string;
  documentId: string;
  score: number;
  excerpt: string;
  charOffset?: number;
  documentIdRef?: string;
  sectionPath?: string;
  matchType?: string;
  version?: string;
}

/**
 * Converse response types
 */
export interface ConverseResult {
  message: string;
  sources?: RagSource[];
  metadata?: {
    timestamp?: string;
    model?: string;
    sources?: RagSource[];
    [key: string]: unknown;
  };
}

/**
 * Shared validator/extractor helper
 * Pure function that validates response and extracts typed content
 *
 * @throws StrictResponseValidationError if response is invalid
 */
function validateAndExtract(response: unknown, action: string): ConverseResult {
  // Validate it's a converse response
  if (!isStrictConverseResponse(response)) {
    throw new StrictResponseValidationError(
      `Response is not a valid converse response for action: ${action}`,
      response,
    );
  }

  // Validate success response structure
  const validation = validateSuccessResponse(response, 'converse');
  if (!validation.valid) {
    throw new StrictResponseValidationError(
      `Invalid converse response for ${action}: ${validation.errors.join(', ')}`,
      response,
    );
  }

  // Extract payload
  const { content, metadata } = extractSuccessPayload<ConverseResult>(response);

  // Ensure content exists
  if (!content) {
    throw new StrictResponseValidationError(
      `No content in converse response for action: ${action}`,
      response,
    );
  }

  return {
    ...content,
    metadata: metadata as ConverseResult['metadata']
  };
}

/**
 * Converse response handler
 * Validates responses and updates the store directly
 */
export const converseResponseHandler = {
  /**
   * Handle converse send response
   * Validates, extracts data, and updates store
   */
  handleSend(response: unknown, conversationId: string): ConverseResult {
    const result = validateAndExtract(response, 'send');
    const store = useConversationsStore();

    // Update store with assistant message
    store.addAssistantMessage(conversationId, result);

    return result;
  },

  /**
   * Generic handler that auto-detects action
   * Validates and returns typed data
   */
  handle(response: unknown): ConverseResult {
    return validateAndExtract(response, 'unknown');
  },
};
