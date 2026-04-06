/**
 * Customer Service API — HTTP client for the Forge customer-service agent.
 * Calls the public endpoint: POST http://localhost:6200/agent-to-agent/public/customer-service/tasks
 *
 * No authentication required. Uses a guest session stored in localStorage.
 * Request format: simplified JSON-RPC 2.0 with a guest context.
 */

const FORGE_API_URL = import.meta.env.VITE_FORGE_API_URL ?? 'http://localhost:5200';
const GUEST_ID_KEY = 'oai_guest_id';

function getOrCreateGuestId(): string {
  const existing = localStorage.getItem(GUEST_ID_KEY);
  if (existing) {
    return existing;
  }
  const newId = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(GUEST_ID_KEY, newId);
  return newId;
}

export interface CustomerServiceRequest {
  message: string;
  sessionId?: string;
}

export interface CustomerServiceResponse {
  id: string | number;
  content: string;
  sessionId: string;
}

let _sessionId: string | null = null;

function getOrCreateSessionId(): string {
  if (!_sessionId) {
    _sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
  return _sessionId;
}

export async function sendCustomerServiceMessage(
  message: string,
): Promise<CustomerServiceResponse> {
  const guestId = getOrCreateGuestId();
  const sessionId = getOrCreateSessionId();

  const requestId = `req_${Date.now()}`;

  const body = {
    jsonrpc: '2.0',
    id: requestId,
    method: 'converse.chat',
    params: {
      context: {
        guestId,
        sessionId,
        orgSlug: 'public',
        agentSlug: 'customer-service',
        agentType: 'forge',
      },
      mode: 'converse',
      userMessage: message,
      payload: {},
    },
  };

  const response = await fetch(
    `${FORGE_API_URL}/agent-to-agent/public/customer-service/tasks`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new Error(`Customer service request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  const content: string =
    data?.result?.payload?.content ??
    data?.result?.content ??
    data?.content ??
    'Sorry, I could not process your message. Please try again.';

  return {
    id: data?.id ?? requestId,
    content,
    sessionId,
  };
}
