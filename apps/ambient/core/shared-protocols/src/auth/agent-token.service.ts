/**
 * Service-to-service authentication for ambient/core Protocol Lab agents.
 *
 * Uses the platform-wide INTERNAL_SERVICE_KEY shared secret pattern,
 * matching how Forge, Compose, Pulse, and Bridge authenticate inter-service
 * A2A calls. No JWT login flow needed — just include the shared key header.
 */

function getServiceKey(): string | undefined {
  return process.env.INTERNAL_SERVICE_KEY;
}

export function getAuthHeaders(): Record<string, string> {
  const key = getServiceKey();
  return key ? { 'x-internal-service-key': key } : {};
}

export async function getAuthHeadersAsync(): Promise<Record<string, string>> {
  return getAuthHeaders();
}

/**
 * No-op stub kept for backwards compatibility.
 */
export async function getAgentToken(): Promise<string> {
  return getServiceKey() ?? '';
}
