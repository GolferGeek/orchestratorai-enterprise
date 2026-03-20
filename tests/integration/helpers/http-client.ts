/**
 * HTTP test client — wraps native fetch with auth headers and error reporting.
 * No mocking. Real HTTP calls only.
 */

export interface TestClient {
  get<T = unknown>(path: string, headers?: Record<string, string>): Promise<T>;
  post<T = unknown>(path: string, body: unknown, headers?: Record<string, string>): Promise<T>;
  put<T = unknown>(path: string, body: unknown, headers?: Record<string, string>): Promise<T>;
  patch<T = unknown>(path: string, body: unknown, headers?: Record<string, string>): Promise<T>;
  delete<T = unknown>(path: string, headers?: Record<string, string>): Promise<T>;
  /** Raw fetch — for testing non-JSON or error responses */
  raw(path: string, init?: RequestInit): Promise<Response>;
}

async function assertOk(response: Response, method: string, path: string): Promise<void> {
  if (!response.ok) {
    const text = await response.text().catch(() => '(unreadable body)');
    throw new Error(
      `HTTP ${method} ${path} failed: ${response.status} ${response.statusText}\n${text}`,
    );
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return null as T;
  const text = await response.text();
  if (!text) return null as T;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return JSON.parse(text) as T;
  }
  return text as unknown as T;
}

/**
 * Creates a test HTTP client bound to a base URL.
 * Optionally includes a Bearer token on every request.
 */
export function createTestClient(baseUrl: string, token?: string): TestClient {
  const base = baseUrl.replace(/\/$/, '');

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = `${base}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extraHeaders,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);
    await assertOk(response, method, path);
    return parseResponse<T>(response);
  }

  return {
    get: <T>(path: string, headers?: Record<string, string>) =>
      request<T>('GET', path, undefined, headers),
    post: <T>(path: string, body: unknown, headers?: Record<string, string>) =>
      request<T>('POST', path, body, headers),
    put: <T>(path: string, body: unknown, headers?: Record<string, string>) =>
      request<T>('PUT', path, body, headers),
    patch: <T>(path: string, body: unknown, headers?: Record<string, string>) =>
      request<T>('PATCH', path, body, headers),
    delete: <T>(path: string, headers?: Record<string, string>) =>
      request<T>('DELETE', path, undefined, headers),
    raw: (path: string, init?: RequestInit) => {
      const url = `${base}${path}`;
      const headers: Record<string, string> = { ...init?.headers as Record<string, string> };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      return fetch(url, { ...init, headers });
    },
  };
}
