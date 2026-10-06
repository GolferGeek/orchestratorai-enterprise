import type { ExecutionContext } from '@orchestrator-ai/transport-types';

/** The API's code when the organization has not set up customer service. */
const NOT_CONFIGURED_CODE = 'customer_service_not_configured';

/** The organization has not set up customer service; `message` is for the guest. */
export class CustomerServiceNotSetUpError extends Error {}

const SESSION_STORAGE_KEY = 'oai_customer_service_session';

export interface CustomerServiceRequest {
  message: string;
  sessionId?: string;
}

export interface CustomerServiceResponse {
  id: string | number;
  content: string;
  sessionId: string;
}

interface CustomerServiceSession {
  sessionToken: string;
  conversationId: string;
  /** When the server stops accepting the token (its signed `exp`), in ms. */
  expiresAt: number;
}

/** A session this close to expiry is replaced before use instead of failing mid-chat. */
const RENEW_BEFORE_EXPIRY_MS = 5 * 60 * 1000;

/** GET /customer-service/config: the route and the organization the widget speaks for. */
interface CustomerServiceContextConfig {
  provider: string;
  model: string;
  orgSlug: string;
}

let currentSession: CustomerServiceSession | null = null;

/** The `exp` the server signed into the guest session token (a JWT), in ms. */
function tokenExpiry(token: string): number {
  const payload = token.split('.')[1];
  if (!payload) {
    throw new Error('Customer service session token is not a JWT');
  }
  const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  const exp = (JSON.parse(json) as { exp?: unknown }).exp;
  if (typeof exp !== 'number') {
    throw new Error('Customer service session token has no expiry');
  }
  return exp * 1000;
}

/**
 * The stored session, if it is in the current format and still has time left.
 * Anything else (an expired session, or one stored by an older version of this
 * widget without its expiry) is removed: it is a cache of a server-issued
 * token, and the server would reject it.
 */
function readStoredSession(): CustomerServiceSession | null {
  const stored = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  const parsed = JSON.parse(stored) as Partial<CustomerServiceSession>;
  if (
    typeof parsed.sessionToken !== 'string' ||
    typeof parsed.conversationId !== 'string' ||
    typeof parsed.expiresAt !== 'number' ||
    parsed.expiresAt - Date.now() < RENEW_BEFORE_EXPIRY_MS
  ) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }

  return {
    sessionToken: parsed.sessionToken,
    conversationId: parsed.conversationId,
    expiresAt: parsed.expiresAt,
  };
}

function forgetSession(): void {
  currentSession = null;
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

async function createSession(): Promise<CustomerServiceSession> {
  if (typeof crypto.randomUUID !== 'function') {
    throw new Error('Secure UUID generation is unavailable');
  }

  const configResponse = await fetch('/api/customer-service/config');
  if (!configResponse.ok) {
    throw new Error(
      `Customer service config failed: ${configResponse.status} ${configResponse.statusText}`,
    );
  }
  const config = (await configResponse.json()) as Partial<CustomerServiceContextConfig>;
  if (
    typeof config.provider !== 'string' ||
    config.provider.length === 0 ||
    typeof config.model !== 'string' ||
    config.model.length === 0 ||
    typeof config.orgSlug !== 'string' ||
    config.orgSlug.length === 0
  ) {
    throw new Error('Customer service context config was malformed');
  }

  const context: Readonly<ExecutionContext> = Object.freeze({
    orgSlug: config.orgSlug,
    userId: crypto.randomUUID(),
    conversationId: crypto.randomUUID(),
    agentSlug: 'customer-service',
    agentType: 'langgraph',
    provider: config.provider,
    model: config.model,
  });

  const response = await fetch('/api/customer-service/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ context }),
  });

  if (!response.ok) {
    throw new Error(`Customer service session failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as Partial<CustomerServiceSession>;
  if (
    typeof data.sessionToken !== 'string' ||
    typeof data.conversationId !== 'string'
  ) {
    throw new Error('Customer service session response was malformed');
  }

  const session: CustomerServiceSession = {
    sessionToken: data.sessionToken,
    conversationId: data.conversationId,
    expiresAt: tokenExpiry(data.sessionToken),
  };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

async function getSession(): Promise<CustomerServiceSession> {
  if (currentSession && currentSession.expiresAt - Date.now() >= RENEW_BEFORE_EXPIRY_MS) {
    return currentSession;
  }

  const storedSession = readStoredSession();
  currentSession = storedSession ?? (await createSession());
  return currentSession;
}

export async function sendCustomerServiceMessage(
  message: string,
): Promise<CustomerServiceResponse> {
  if (typeof crypto.randomUUID !== 'function') {
    throw new Error('Secure UUID generation is unavailable');
  }
  const requestId = crypto.randomUUID();
  const converse = (session: CustomerServiceSession) =>
    fetch('/api/customer-service/converse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `GuestSession ${session.sessionToken}`,
      },
      body: JSON.stringify({
        userMessage: message,
        interactionMode: 'text',
      }),
    });

  let session = await getSession();
  let response = await converse(session);
  // 401: the server no longer accepts this session (expired early, a rotated
  // secret, or the widget now speaks for another organization). Start a new
  // one, once; a second refusal is a real error.
  if (response.status === 401) {
    forgetSession();
    session = await getSession();
    response = await converse(session);
  }

  if (!response.ok) {
    if (response.status === 503) {
      const body = (await response.json()) as { code?: unknown; message?: unknown };
      if (body.code === NOT_CONFIGURED_CODE && typeof body.message === 'string') {
        throw new CustomerServiceNotSetUpError(body.message);
      }
    }
    throw new Error(`Customer service request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { message?: unknown };

  if (typeof data.message !== 'string') {
    throw new Error('Customer service response was malformed');
  }

  return {
    id: requestId,
    content: data.message,
    sessionId: session.conversationId,
  };
}
