function readRequiredApiBaseUrl(): string {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error('VITE_API_BASE_URL is required before the shared API client can be used.');
  }

  return apiBaseUrl;
}

function buildUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalizedBase}${normalizedPath}`;
}

function buildHeaders(hasBody: boolean): Headers {
  const headers = new Headers({
    Accept: 'application/json',
  });

  if (hasBody) {
    headers.set('Content-Type', 'application/json');
  }

  const token = localStorage.getItem('authToken');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return headers;
}

async function parseJsonResponse<TResponse>(response: Response): Promise<TResponse> {
  const text = await response.text();
  if (!text) {
    return undefined as TResponse;
  }

  return JSON.parse(text) as TResponse;
}

export class PlatformApiClient {
  private readonly baseUrl = readRequiredApiBaseUrl();

  async get<TResponse>(path: string): Promise<TResponse> {
    const response = await fetch(buildUrl(this.baseUrl, path), {
      method: 'GET',
      headers: buildHeaders(false),
    });

    if (!response.ok) {
      throw new Error(`GET ${path} failed with status ${response.status}`);
    }

    return parseJsonResponse<TResponse>(response);
  }

  async post<TResponse, TBody>(path: string, body: TBody): Promise<TResponse> {
    const response = await fetch(buildUrl(this.baseUrl, path), {
      method: 'POST',
      headers: buildHeaders(true),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`POST ${path} failed with status ${response.status}`);
    }

    return parseJsonResponse<TResponse>(response);
  }

  async put<TResponse, TBody>(path: string, body: TBody): Promise<TResponse> {
    const response = await fetch(buildUrl(this.baseUrl, path), {
      method: 'PUT',
      headers: buildHeaders(true),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`PUT ${path} failed with status ${response.status}`);
    }

    return parseJsonResponse<TResponse>(response);
  }

  async delete<TResponse>(path: string): Promise<TResponse> {
    const response = await fetch(buildUrl(this.baseUrl, path), {
      method: 'DELETE',
      headers: buildHeaders(false),
    });

    if (!response.ok) {
      throw new Error(`DELETE ${path} failed with status ${response.status}`);
    }

    return parseJsonResponse<TResponse>(response);
  }
}

export const platformApiClient = new PlatformApiClient();
