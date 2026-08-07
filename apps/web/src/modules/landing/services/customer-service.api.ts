import type { ExecutionContext } from '@orchestrator-ai/transport-types';

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
}

interface CustomerServiceContextConfig {
  provider: string;
  model: string;
}

let currentSession: CustomerServiceSession | null = null;

function readStoredSession(): CustomerServiceSession | null {
  const stored = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  const parsed = JSON.parse(stored) as Partial<CustomerServiceSession>;
  if (
    typeof parsed.sessionToken !== 'string' ||
    typeof parsed.conversationId !== 'string'
  ) {
    throw new Error('Stored customer service session is malformed');
  }

  return {
    sessionToken: parsed.sessionToken,
    conversationId: parsed.conversationId,
  };
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
    config.model.length === 0
  ) {
    throw new Error('Customer service context config was malformed');
  }

  const context: Readonly<ExecutionContext> = Object.freeze({
    orgSlug: 'public',
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

  const session = {
    sessionToken: data.sessionToken,
    conversationId: data.conversationId,
  };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

async function getSession(): Promise<CustomerServiceSession> {
  if (currentSession) {
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
  const session = await getSession();

  const response = await fetch(
    '/api/customer-service/converse',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `GuestSession ${session.sessionToken}`,
      },
      body: JSON.stringify({
        userMessage: message,
        interactionMode: 'text',
      }),
    },
  );

  if (!response.ok) {
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
