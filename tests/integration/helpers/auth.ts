/**
 * Auth helper — logs in against the real platform API and caches the JWT.
 * No mocking. Real authentication only.
 */
import { apiUrl } from './ports';

const AUTH_BASE = apiUrl('platform');

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

export function getTestCredentials(): { email: string; password: string } {
  const email = process.env.SUPABASE_TEST_USER;
  const password = process.env.SUPABASE_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'SUPABASE_TEST_USER and SUPABASE_TEST_PASSWORD are required for integration tests',
    );
  }
  return { email, password };
}

/**
 * Login with test credentials. Token is cached for the entire test run.
 */
export async function login(): Promise<string> {
  if (cachedToken) return cachedToken;
  const credentials = getTestCredentials();

  const res = await fetch(`${AUTH_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
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
  const userRes = await fetch(`${AUTH_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!userRes.ok) {
    const text = await userRes.text();
    throw new Error(`GET /auth/me failed: ${userRes.status} ${text}`);
  }

  const orgsRes = await fetch(`${AUTH_BASE}/api/rbac/me/organizations`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!orgsRes.ok) {
    const text = await orgsRes.text();
    throw new Error(`GET /api/rbac/me/organizations failed: ${orgsRes.status} ${text}`);
  }

  const user = (await userRes.json()) as UserContext['user'];
  const orgsBody = (await orgsRes.json()) as {
    organizations: UserContext['organizations'];
  };

  cachedContext = {
    user,
    organizations: orgsBody.organizations,
  };
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
