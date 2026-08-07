import { tokenStorage } from '@/services/tokenStorageService';
import { useRbacStore } from '@/stores/rbacStore';
import { resolveConcreteOrganization } from '@/shared/services/organization-context';

const API_BASE = '/api/secure-conversations';

interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  del(path: string): Promise<void>;
}

function createClient(baseUrl: string): ApiClient {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${baseUrl}${path}`;
    const token = await tokenStorage.getAccessToken();
    if (!token) {
      throw new Error(
        'Authentication is required for the Secure Conversations API',
      );
    }
    const rbac = useRbacStore();
    await rbac.initialize();
    const organizationSlug = await resolveConcreteOrganization(rbac);
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-organization-slug': organizationSlug,
      },
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
      throw new Error('Secure Conversations API returned an empty response');
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error('Secure Conversations API returned malformed JSON');
    }
  }

  async function del(path: string): Promise<void> {
    const token = await tokenStorage.getAccessToken();
    if (!token) {
      throw new Error(
        'Authentication is required for the Secure Conversations API',
      );
    }
    const rbac = useRbacStore();
    await rbac.initialize();
    const organizationSlug = await resolveConcreteOrganization(rbac);
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-organization-slug': organizationSlug,
      },
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API error ${response.status}: ${errorBody}`);
    }
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    del,
  };
}

export function useApi() {
  const secureConversationsApi = createClient(API_BASE);

  return { secureConversationsApi };
}
