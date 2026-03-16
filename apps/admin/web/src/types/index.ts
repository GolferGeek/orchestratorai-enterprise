/**
 * Admin Web Type Definitions
 * Exports only types relevant to org/user/role/entitlements management.
 */

// =====================================
// AUTH TYPES
// =====================================
export * from './auth';

// =====================================
// SHARED UTILITY TYPES
// =====================================

export type Primitive = string | number | boolean | null;
export type JsonValue = Primitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type UnknownRecord = Record<string, JsonValue>;

// =====================================
// COMMON STORE TYPES
// =====================================

export interface LoadingStates {
  isLoading: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
}

export interface ErrorState {
  error: string | null;
  errorCode?: string;
}

export interface PaginationState {
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface SortOptions {
  field: string;
  direction: 'asc' | 'desc';
}

export interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    field: string;
    message: string;
    code?: string;
  }>;
}

// =====================================
// HTTP CONSTANTS
// =====================================

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const ERROR_CODES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  SERVER_ERROR: 'SERVER_ERROR',
  UNKNOWN: 'UNKNOWN',
} as const;

export type HttpStatus = typeof HTTP_STATUS[keyof typeof HTTP_STATUS];
export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

// =====================================
// TYPE GUARDS
// =====================================

export function isApiResponse<T>(obj: unknown): obj is { success: boolean; data?: T } {
  return Boolean(obj) && typeof obj === 'object' &&
    typeof (obj as { success?: unknown }).success === 'boolean';
}
