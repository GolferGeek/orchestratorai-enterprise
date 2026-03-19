export interface AgentEndpoint {
  baseUrl: string;
  agent: string;
}

export const AGENT_ENDPOINTS: Record<string, AgentEndpoint> = {
  'sunstream': { baseUrl: 'http://localhost:6407', agent: 'sunstream' },
  'ascentek': { baseUrl: 'http://localhost:6408', agent: 'ascentek' },
};

import { getAuthHeadersAsync } from '../auth/agent-token.service';

export class AgentHttpClient {
  constructor(private endpoint: AgentEndpoint) {}

  async call(path: string, method: string = 'GET', body?: unknown): Promise<unknown> {
    const url = `${this.endpoint.baseUrl}${path}`;
    const authHeaders = await getAuthHeadersAsync();
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Agent HTTP call failed: ${res.status} ${url}`);
    return res.json();
  }
}
