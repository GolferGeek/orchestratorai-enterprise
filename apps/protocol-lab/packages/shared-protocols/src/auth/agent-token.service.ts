/**
 * Service-to-service authentication for Protocol Lab agents.
 *
 * Uses the platform-wide INTERNAL_SERVICE_KEY shared secret pattern,
 * matching how Forge, Compose, Pulse, and Bridge authenticate inter-service
 * A2A calls. No JWT login flow needed — just include the shared key header.
 */

function getServiceKey(): string | undefined {
  return process.env.INTERNAL_SERVICE_KEY;
}

/**
 * Returns auth headers for service-to-service calls.
 * Synchronous — kept for backwards compatibility with existing call sites.
 */
export function getAuthHeaders(): Record<string, string> {
  const key = getServiceKey();
  return key ? { 'x-internal-service-key': key } : {};
}

/**
 * Async variant — returns the same headers as getAuthHeaders().
 * Kept for backwards compatibility with call sites that awaited a JWT fetch.
 */
export async function getAuthHeadersAsync(): Promise<Record<string, string>> {
  return getAuthHeaders();
}

/**
 * No-op stub kept for backwards compatibility.
 * The service-key auth pattern doesn't require token pre-warming.
 */
export async function getAgentToken(): Promise<string> {
  return getServiceKey() ?? '';
}
