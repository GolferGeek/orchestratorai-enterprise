import { useAuthStore } from '../stores/auth.store';

interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  del<T>(path: string): Promise<T>;
}

function createClient(baseUrl: string): ApiClient {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${baseUrl}${path}`;
    const authStore = useAuthStore();
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...authStore.getAuthHeaders(),
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
      return undefined as T;
    }

    return JSON.parse(text) as T;
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    del: <T>(path: string) => request<T>('DELETE', path),
  };
}

export function useApi() {
  const protocolApi = createClient('/protocol-api');
  const researchHubApi = createClient('/research-hub');
  const marketPulseApi = createClient('/market-pulse');
  const contentForgeApi = createClient('/content-forge');
  const agentConsumerApi = createClient('/agent-consumer');
  const miniMeApi = createClient('/mini-me');
  const prairieRidgeApi = createClient('/prairie-ridge-app');
  const buildwellApi = createClient('/buildwell-app');

  function resolveAgentApi(agentName: string): ApiClient {
    const buildwellAgents = ['buildwell', 'apex-oem', 'alloytech'];
    const prairieRidgeAgents = ['prairie-ridge', 'agriserv', 'central-farm-bank'];
    if (buildwellAgents.includes(agentName)) return buildwellApi;
    if (prairieRidgeAgents.includes(agentName)) return prairieRidgeApi;
    return protocolApi;
  }

  return { protocolApi, researchHubApi, marketPulseApi, contentForgeApi, agentConsumerApi, miniMeApi, prairieRidgeApi, buildwellApi, resolveAgentApi };
}
