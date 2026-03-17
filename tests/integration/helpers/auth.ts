/**
 * Auth helper — logs in against the real Auth API and caches the JWT.
 * No mocking. Real authentication only.
 */
import { apiUrl } from './ports';

const AUTH_BASE = apiUrl('auth');

interface LoginResult {
  accessToken: string;
  refreshToken: string;
}

interface UserContext {
  user: { id: string; email: string };
  organizations: Array<{ slug: string; name: string }>;
}

// Cached across the test run
let cachedToken: string | null = null;
let cachedContext: UserContext | null = null;

/**
 * Login with test credentials. Token is cached for the entire test run.
 */
export async function login(): Promise<string> {
  if (cachedToken) return cachedToken;

  const res = await fetch(`${AUTH_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'golfergeek@orchestratorai.io',
      password: 'GolferGeek123!',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as LoginResult;
  if (!data.accessToken) {
    throw new Error(`Login response missing accessToken: ${JSON.stringify(data)}`);
  }

  cachedToken = data.accessToken;
  return cachedToken;
}

/**
 * Get the user context (user info + orgs). Cached per run.
 */
export async function getUserContext(): Promise<UserContext> {
  if (cachedContext) return cachedContext;

  const token = await login();
  const res = await fetch(`${AUTH_BASE}/users/me/context`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET /users/me/context failed: ${res.status} ${text}`);
  }

  cachedContext = (await res.json()) as UserContext;
  return cachedContext!;
}

/**
 * Get an ExecutionContext suitable for invoke calls.
 */
export async function getExecutionContext(agentSlug = 'test-agent', agentType = 'context'): Promise<Record<string, string>> {
  const ctx = await getUserContext();
  return {
    orgSlug: ctx.organizations[0]?.slug ?? 'marketing',
    userId: ctx.user.id,
    conversationId: `e2e-${Date.now()}`,
    agentSlug,
    agentType,
    provider: 'ollama',
    model: 'llama3.2',
  };
}

/**
 * Clear cached auth state (for testing token refresh, etc.)
 */
export function clearAuthCache(): void {
  cachedToken = null;
  cachedContext = null;
}
