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
  const response = await fetch('/api/customer-service/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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
  const requestId = `req_${Date.now()}`;
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
