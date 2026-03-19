/**
 * HTTP client helper for making requests to running agent services in E2E tests.
 *
 * Uses native fetch (available in Node 18+). All methods throw on non-2xx responses
 * so test failures are visible — no silent swallowing of HTTP errors.
 */

export const SERVICE_BASE_URLS = {
  protocolApi: 'http://localhost:6402',
  sunstream: 'http://localhost:6407',
  ascentek: 'http://localhost:6408',
} as const;

export interface TestClient {
  get<T = unknown>(path: string, headers?: Record<string, string>): Promise<T>;
  post<T = unknown>(path: string, body: unknown, headers?: Record<string, string>): Promise<T>;
  put<T = unknown>(path: string, body: unknown, headers?: Record<string, string>): Promise<T>;
  delete<T = unknown>(path: string, headers?: Record<string, string>): Promise<T>;
}

async function assertOk(response: Response, method: string, path: string): Promise<void> {
  if (!response.ok) {
    const text = await response.text().catch(() => '(unreadable body)');
    throw new Error(
      `HTTP ${method} ${path} failed: ${response.status} ${response.statusText}\n${text}`,
    );
  }
}

/**
 * Creates a test HTTP client bound to the given base URL.
 *
 * @param baseUrl - Base URL of the service under test (e.g. 'http://localhost:6402')
 */
export function createTestClient(baseUrl: string): TestClient {
  const normalizedBase = baseUrl.replace(/\/$/, '');

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = `${normalizedBase}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extraHeaders,
    };

    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);
    await assertOk(response, method, path);

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return response.json() as Promise<T>;
    }
    return response.text() as unknown as Promise<T>;
  }

  return {
    get: <T>(path: string, headers?: Record<string, string>) =>
      request<T>('GET', path, undefined, headers),
    post: <T>(path: string, body: unknown, headers?: Record<string, string>) =>
      request<T>('POST', path, body, headers),
    put: <T>(path: string, body: unknown, headers?: Record<string, string>) =>
      request<T>('PUT', path, body, headers),
    delete: <T>(path: string, headers?: Record<string, string>) =>
      request<T>('DELETE', path, undefined, headers),
  };
}
