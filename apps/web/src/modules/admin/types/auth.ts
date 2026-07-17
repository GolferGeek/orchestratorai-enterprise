import type { JsonValue } from '@orchestrator-ai/transport-types';

/**
 * Authentication Type Definitions
 * Domain-specific types for authentication and authorization
 */

// =====================================
// AUTH PAYLOADS
// =====================================

/**
 * Signup data payload
 */
export interface SignupData {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  acceptedTerms: boolean;
  metadata?: {
    referralCode?: string;
    source?: string;
    marketingConsent?: boolean;
  };
}

/**
 * Login credentials payload
 */
export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
  mfaToken?: string;
}

/**
 * Password reset request payload
 */
export interface PasswordResetRequest {
  email: string;
}

/**
 * Password reset confirmation payload
 */
export interface PasswordResetConfirmation {
  token: string;
  newPassword: string;
}

/**
 * Email verification payload
 */
export interface EmailVerification {
  token: string;
  email?: string;
}

/**
 * MFA setup payload
 */
export interface MFASetup {
  method: 'totp' | 'sms' | 'email';
  phoneNumber?: string;
  email?: string;
}

/**
 * MFA verification payload
 */
export interface MFAVerification {
  code: string;
  trustDevice?: boolean;
}

// =====================================
// AUTH ERRORS
// =====================================

/**
 * Authentication error codes
 */
export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'USER_NOT_FOUND'
  | 'USER_ALREADY_EXISTS'
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_SUSPENDED'
  | 'PASSWORD_EXPIRED'
  | 'WEAK_PASSWORD'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'MFA_REQUIRED'
  | 'MFA_INVALID'
  | 'SESSION_EXPIRED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Authentication error
 */
export interface AuthError extends Error {
  code: AuthErrorCode;
  statusCode?: number;
  details?: (
    {
      field?: string;
      reason?: string;
      retryAfter?: number;
    }
    & Record<string, JsonValue>
  );
  timestamp: string;
}

/**
 * Auth response error structure
 */
export interface AuthResponseError {
  error: {
    code: AuthErrorCode;
    message: string;
    details?: JsonValue;
  };
  status: number;
  timestamp: string;
}

// =====================================
// USER & SESSION
// =====================================

/**
 * User profile
 */
export interface UserProfile {
  id: string;
  email: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatarUrl?: string;
  phoneNumber?: string;
  emailVerified: boolean;
  phoneVerified?: boolean;
  mfaEnabled: boolean;
  roles: string[];
  permissions: string[];
  preferences?: Record<string, JsonValue>;
  metadata?: Record<string, JsonValue>;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

/**
 * Session information
 */
export interface SessionInfo {
  id: string;
  userId: string;
  token: string;
  refreshToken?: string;
  expiresAt: string;
  createdAt: string;
  deviceInfo?: {
    userAgent?: string;
    ip?: string;
    device?: string;
    browser?: string;
    os?: string;
  };
  mfaVerified?: boolean;
  trustedDevice?: boolean;
}

/**
 * Auth state
 */
export interface AuthState {
  isAuthenticated: boolean;
  user: UserProfile | null;
  session: SessionInfo | null;
  loading: boolean;
  error: AuthError | null;
  isInitialized: boolean;
}

// =====================================
// AUTH RESPONSES
// =====================================

/**
 * Login response
 */
export interface LoginResponse {
  success: boolean;
  user: UserProfile;
  session: SessionInfo;
  requiresMFA?: boolean;
  mfaToken?: string;
}

/**
 * Signup response
 */
export interface SignupResponse {
  success: boolean;
  user: UserProfile;
  session?: SessionInfo;
  requiresVerification: boolean;
  verificationSent: boolean;
}

/**
 * Token refresh response
 */
export interface TokenRefreshResponse {
  success: boolean;
  token: string;
  refreshToken?: string;
  expiresAt: string;
}

/**
 * Password reset response
 */
export interface PasswordResetResponse {
  success: boolean;
  message: string;
  resetTokenSent: boolean;
}

/**
 * Email verification response
 */
export interface EmailVerificationResponse {
  success: boolean;
  message: string;
  verified: boolean;
}

// =====================================
// PERMISSIONS & ROLES
// =====================================

/**
 * Permission definition
 */
export interface Permission {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: string;
  scope?: string;
}

/**
 * Role definition
 */
export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSystemRole: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiredPermissions?: string[];
  missingPermissions?: string[];
}

// =====================================
// AUTH UTILITIES
// =====================================

/**
 * Token payload (JWT)
 */
export interface TokenPayload {
  sub: string; // user ID
  email: string;
  roles: string[];
  iat: number; // issued at
  exp: number; // expires at
  aud?: string | undefined; // audience
  iss?: string | undefined; // issuer
  [key: string]: JsonValue | string | string[] | number | undefined;
}

/**
 * Type guard for AuthError
 */
export function isAuthError(error: unknown): error is AuthError {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    'message' in error &&
    typeof (error as AuthError).code === 'string' &&
    typeof (error as AuthError).message === 'string'
  );
}

/**
 * Type guard for AuthResponseError
 */
export function isAuthResponseError(obj: unknown): obj is AuthResponseError {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'error' in obj &&
    'status' in obj &&
    typeof (obj as AuthResponseError).status === 'number' &&
    typeof (obj as AuthResponseError).error === 'object'
  );
}
