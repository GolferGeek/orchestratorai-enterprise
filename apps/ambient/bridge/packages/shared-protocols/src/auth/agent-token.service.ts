/**
 * Shared service that obtains and caches a JWT from the main Orchestrator AI API.
 * Used by agent backends for inter-agent authenticated calls.
 *
 * On startup, authenticates with the main API (port 6100) using env credentials,
 * caches the token, and refreshes it before expiry.
 */
const LOGIN_URL = process.env.MAIN_API_URL
  ? `${process.env.MAIN_API_URL}/auth/login`
  : 'http://localhost:6100/auth/login';

const LOGIN_EMAIL = process.env.AGENT_AUTH_EMAIL || 'golfergeek@orchestratorai.io';
const LOGIN_PASSWORD = process.env.AGENT_AUTH_PASSWORD || 'GolferGeek123!';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export async function getAgentToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && tokenExpiresAt > now + 60) {
    return cachedToken;
  }

  const response = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(`Agent auth failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { accessToken: string; expiresIn?: number };
  cachedToken = data.accessToken;

  // Decode exp from JWT payload
  const payloadB64 = data.accessToken.split('.')[1];
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  tokenExpiresAt = payload.exp || now + (data.expiresIn || 3600);

  return cachedToken;
}

export function getAuthHeaders(): Record<string, string> {
  if (cachedToken) {
    return { Authorization: `Bearer ${cachedToken}` };
  }
  return {};
}

export async function getAuthHeadersAsync(): Promise<Record<string, string>> {
  const token = await getAgentToken();
  return { Authorization: `Bearer ${token}` };
}
