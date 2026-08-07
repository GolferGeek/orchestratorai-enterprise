/**
 * API client for the unified Ambient API module.
 * All requests go through the Vite proxy at /api/ambient.
 */

import { tokenStorage } from '@/services/tokenStorageService';
import { useRbacStore } from '@/stores/rbacStore';
import { resolveConcreteOrganization } from '@/shared/services/organization-context';

interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  del<T>(path: string): Promise<T>;
}

function createClient(baseUrl: string): ApiClient {
  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = await tokenStorage.getAccessToken();
    if (!token) {
      throw new Error('Authentication is required for the Ambient API');
    }
    const rbac = useRbacStore();
    await rbac.initialize();
    const organizationSlug = await resolveConcreteOrganization(rbac);
    headers.Authorization = `Bearer ${token}`;
    headers['x-organization-slug'] = organizationSlug;
    const options: RequestInit = {
      method,
      headers,
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API error ${response.status}: ${errorBody}`);
    }

    const text = await response.text();
    if (!text) {
      return undefined as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error('Ambient API returned malformed JSON');
    }
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    del: <T>(path: string) => request<T>('DELETE', path),
  };
}

export function useApi() {
  const baseUrl = '/api/ambient';
  const ambientApi = createClient(baseUrl);
  return { ambientApi };
}
