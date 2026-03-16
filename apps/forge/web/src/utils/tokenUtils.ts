/**
 * JWT Token utilities for expiration checking and refresh management
 */
interface JWTPayload {
  exp?: number; // Expiration time (seconds since epoch)
  iat?: number; // Issued at time
  sub?: string; // Subject
  [key: string]: unknown;
}
/**
 * Decode JWT token without verification (client-side only for expiration checking)
 * Note: This is not secure verification, only for reading public claims
 */
export function decodeJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}
/**
 * Check if JWT token is expired or will expire soon
 * @param token JWT token string
 * @param bufferMinutes Minutes before expiration to consider "expired" (default: 5)
 * @returns true if token is expired or will expire soon
 */
export function isTokenExpiredOrExpiringSoon(token: string, bufferMinutes: number = 5): boolean {
  const payload = decodeJWT(token);
  if (!payload || !payload.exp) {
    return true; // Consider invalid tokens as expired
  }
  const now = Math.floor(Date.now() / 1000); // Current time in seconds
  const expiration = payload.exp;
  const bufferSeconds = bufferMinutes * 60;
  return (expiration - bufferSeconds) <= now;
}
/**
 * Get time remaining until token expires (in minutes)
 * @param token JWT token string
 * @returns minutes until expiration, or 0 if expired/invalid
 */
export function getTokenTimeRemaining(token: string): number {
  const payload = decodeJWT(token);
  if (!payload || !payload.exp) {
    return 0;
  }
  const now = Math.floor(Date.now() / 1000);
  const expiration = payload.exp;
  const secondsRemaining = expiration - now;
  return Math.max(0, Math.floor(secondsRemaining / 60));
}
/**
 * Check if a token is valid (not malformed)
 * @param token JWT token string
 * @returns true if token appears to be a valid JWT structure
 */
export function isValidJWTStructure(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }
  try {
    // Try to decode each part to ensure it's valid base64
    atob(parts[0].replace(/-/g, '+').replace(/_/g, '/'));
    atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return true;
  } catch {
    return false;
  }
}