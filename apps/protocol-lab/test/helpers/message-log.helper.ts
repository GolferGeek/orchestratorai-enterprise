/**
 * Helper for asserting on protocol-api message logs in E2E tests.
 *
 * All functions communicate with the protocol-api running at localhost:6402.
 * They use native fetch and throw on HTTP errors — no silent failures.
 *
 * The protocol-api message endpoints are:
 *   GET  /api/messages          — list with optional source/target/method/status filters
 *   GET  /api/messages/:id      — fetch a single message by id
 *   POST /api/messages          — record a new message (used by agents, not typically by tests)
 */

const PROTOCOL_API_BASE = 'http://localhost:6402';

export interface MessageFilters {
  source?: string;
  target?: string;
  method?: string;
  status?: 'pending' | 'success' | 'error' | 'timeout';
}

export interface ProtocolMessage {
  id: string;
  source: string;
  target: string;
  method: string;
  status: 'pending' | 'success' | 'error' | 'timeout';
  timestamp: string;
  [key: string]: unknown;
}

export interface MessagesResponse {
  messages: ProtocolMessage[];
  total: number;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '(unreadable body)');
    throw new Error(
      `protocol-api request failed: GET ${url} → ${response.status} ${response.statusText}\n${text}`,
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Fetches messages from the protocol-api with optional filters.
 *
 * @param filters - Optional source, target, method, or status filters
 * @returns The full response object containing messages array and total count
 */
export async function getMessages(filters?: MessageFilters): Promise<MessagesResponse> {
  const params = new URLSearchParams();
  if (filters?.source) params.set('source', filters.source);
  if (filters?.target) params.set('target', filters.target);
  if (filters?.method) params.set('method', filters.method);
  if (filters?.status) params.set('status', filters.status);

  const query = params.toString();
  const url = `${PROTOCOL_API_BASE}/api/messages${query ? `?${query}` : ''}`;

  return fetchJson<MessagesResponse>(url);
}

/**
 * Fetches a single message by its ID from the protocol-api.
 * Throws if not found (404 propagates as an error).
 *
 * @param id - The message ID to fetch
 */
export async function getMessageById(id: string): Promise<ProtocolMessage> {
  const url = `${PROTOCOL_API_BASE}/api/messages/${encodeURIComponent(id)}`;
  return fetchJson<ProtocolMessage>(url);
}

/**
 * Polls the protocol-api until a message matching the predicate appears,
 * or until the timeout expires.
 *
 * Throws if the timeout is reached without finding a matching message,
 * giving a clear assertion failure rather than a hanging test.
 *
 * @param predicate - Function that returns true for the desired message
 * @param timeoutMs - How long to poll before giving up (default: 10000ms)
 * @param intervalMs - Poll interval (default: 200ms)
 */
export async function waitForMessage(
  predicate: (msg: ProtocolMessage) => boolean,
  timeoutMs = 10000,
  intervalMs = 200,
): Promise<ProtocolMessage> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { messages } = await getMessages();
    const match = messages.find(predicate);
    if (match) {
      return match;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `waitForMessage: no matching message found within ${timeoutMs}ms`,
  );
}

/**
 * Posts a clear request to protocol-api to remove all recorded messages.
 * Used in afterEach / afterAll cleanup blocks.
 *
 * NOTE: This requires the protocol-api to expose a DELETE /api/messages endpoint.
 * If that endpoint does not exist yet, this will throw — which is the correct
 * behavior. Add the endpoint to protocol-api rather than swallowing the error here.
 */
export async function clearMessages(): Promise<void> {
  const response = await fetch(`${PROTOCOL_API_BASE}/api/messages`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '(unreadable body)');
    throw new Error(
      `clearMessages failed: DELETE /api/messages → ${response.status} ${response.statusText}\n${text}`,
    );
  }
}
