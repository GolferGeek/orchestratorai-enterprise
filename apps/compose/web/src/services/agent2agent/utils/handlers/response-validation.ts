/**
 * Strict Response Validation
 * Type guards and validators for strict A2A protocol responses
 */

import type {
  StrictA2AResponse,
  StrictA2ASuccessResponse,
  StrictA2AErrorResponse,
  StrictPlanResponse,
  StrictBuildResponse,
  StrictConverseResponse,
} from '@orchestrator-ai/transport-types/shared/strict-aliases';

/**
 * Response validation error
 */
export class StrictResponseValidationError extends Error {
  constructor(
    message: string,
    public response?: unknown,
  ) {
    super(`Response validation failed: ${message}`);
    this.name = 'StrictResponseValidationError';
  }
}

/**
 * Validate that response is a valid JSON-RPC response
 */
export function validateJsonRpcEnvelope(response: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!response || typeof response !== 'object') {
    errors.push('Response must be an object');
    return { valid: false, errors };
  }

  const resp = response as Record<string, unknown>;

  if (resp.jsonrpc !== '2.0') {
    errors.push('Invalid JSON-RPC version');
  }

  if (resp.id === undefined) {
    errors.push('Missing response id');
  }

  if (!('result' in response) && !('error' in response)) {
    errors.push('Response must have either result or error');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate success response structure
 */
export function validateSuccessResponse(
  response: unknown,
  expectedMode?: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!response || typeof response !== 'object') {
    errors.push('Missing result in success response');
    return { valid: false, errors };
  }

  const resp = response as Record<string, unknown>;

  if (!resp.result) {
    errors.push('Missing result in success response');
    return { valid: false, errors };
  }

  const result = resp.result as Record<string, unknown>;

  if (result.success !== true) {
    errors.push('Success flag must be true');
  }

  if (!result.mode) {
    errors.push('Missing mode in result');
  }

  if (expectedMode && result.mode !== expectedMode) {
    errors.push(`Mode mismatch: expected ${expectedMode}, got ${result.mode}`);
  }

  if (!result.payload) {
    errors.push('Missing payload in result');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate error response structure
 */
export function validateErrorResponse(response: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!response || typeof response !== 'object') {
    errors.push('Missing error in error response');
    return { valid: false, errors };
  }

  const resp = response as Record<string, unknown>;

  if (!resp.error) {
    errors.push('Missing error in error response');
    return { valid: false, errors };
  }

  const error = resp.error as Record<string, unknown>;

  if (typeof error.code !== 'number') {
    errors.push('Error code must be a number');
  }

  if (typeof error.message !== 'string') {
    errors.push('Error message must be a string');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Type guard: Check if response is a strict error response
 */
export function isStrictError(
  response: StrictA2AResponse,
): response is StrictA2AErrorResponse {
  return 'error' in response && response.error !== undefined;
}

/**
 * Type guard: Check if response is a strict success response
 */
export function isStrictSuccess(
  response: StrictA2AResponse,
): response is StrictA2ASuccessResponse {
  return 'result' in response && response.result !== undefined;
}

/**
 * Extract error details from error response
 */
export function extractErrorDetails(response: StrictA2AErrorResponse): {
  code: number;
  message: string;
  mode?: string;
  data?: unknown;
} {
  return {
    code: response.error.code,
    message: response.error.message,
    mode: response.error.data?.mode,
    data: response.error.data,
  };
}

/**
 * Extract success payload from success response
 */
export function extractSuccessPayload<T = unknown>(
  response: StrictA2ASuccessResponse,
): {
  mode: string;
  content: T;
  metadata: unknown;
} {
  return {
    mode: response.result.mode,
    content: response.result.payload.content as T,
    metadata: response.result.payload.metadata,
  };
}

/**
 * Type guard functions for mode-specific responses
 */
export function isStrictPlanResponse(response: unknown): response is StrictPlanResponse {
  if (!response || typeof response !== 'object') {
    return false;
  }
  const resp = response as Record<string, unknown>;
  return (
    resp.jsonrpc === '2.0' &&
    resp.result !== undefined &&
    typeof resp.result === 'object' &&
    resp.result !== null &&
    (resp.result as Record<string, unknown>).mode === 'plan'
  );
}

export function isStrictBuildResponse(response: unknown): response is StrictBuildResponse {
  if (!response || typeof response !== 'object') {
    return false;
  }
  const resp = response as Record<string, unknown>;
  return (
    resp.jsonrpc === '2.0' &&
    resp.result !== undefined &&
    typeof resp.result === 'object' &&
    resp.result !== null &&
    (resp.result as Record<string, unknown>).mode === 'build'
  );
}

export function isStrictConverseResponse(response: unknown): response is StrictConverseResponse {
  if (!response || typeof response !== 'object') {
    return false;
  }
  const resp = response as Record<string, unknown>;
  return (
    resp.jsonrpc === '2.0' &&
    resp.result !== undefined &&
    typeof resp.result === 'object' &&
    resp.result !== null &&
    (resp.result as Record<string, unknown>).mode === 'converse'
  );
}

export function isStrictErrorResponse(response: unknown): response is StrictA2AErrorResponse {
  if (!response || typeof response !== 'object') {
    return false;
  }
  const resp = response as Record<string, unknown>;
  return (
    resp.jsonrpc === '2.0' &&
    'error' in response
  );
}

export function isStrictSuccessResponse(response: unknown): response is StrictA2ASuccessResponse {
  if (!response || typeof response !== 'object') {
    return false;
  }
  const resp = response as Record<string, unknown>;
  return (
    resp.jsonrpc === '2.0' &&
    'result' in response &&
    resp.result !== undefined &&
    typeof resp.result === 'object' &&
    resp.result !== null &&
    (resp.result as Record<string, unknown>).success === true
  );
}
