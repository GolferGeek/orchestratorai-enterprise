/**
 * Strict Request Validation Utilities
 */

import type { StrictA2ARequest } from '@orchestrator-ai/transport-types';

/**
 * Validation error class
 */
export class StrictRequestValidationError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(`Validation failed for field '${field}': ${message}`);
    this.name = 'StrictRequestValidationError';
  }
}

/**
 * Type guard to check if a value is a strict request
 */
export function isStrictRequest(value: unknown): value is StrictA2ARequest {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    obj.jsonrpc === '2.0' &&
    obj.id !== undefined &&
    obj.method !== undefined &&
    obj.params !== undefined
  );
}

/**
 * Validate a strict request before sending
 */
export function validateStrictRequest(
  request: StrictA2ARequest,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate JSON-RPC envelope
  if (request.jsonrpc !== '2.0') {
    errors.push('Invalid jsonrpc version');
  }
  if (!request.id) {
    errors.push('Missing request id');
  }
  if (!request.method) {
    errors.push('Missing method');
  }
  if (!request.params) {
    errors.push('Missing params');
  }

  // Validate params
  const params = request.params;
  if (params) {
    if (!params.mode) {
      errors.push('Missing mode in params');
    }
    if (!params.context?.conversationId) {
      errors.push('Missing conversationId in params.context');
    }
  }

  return { valid: errors.length === 0, errors };
}
