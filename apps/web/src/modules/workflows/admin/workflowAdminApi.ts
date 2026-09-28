import type {
  WorkflowAdminAgentChange,
  WorkflowAdminMatrix,
  WorkflowAdminRow,
  WorkflowAdminView,
  WorkflowModelProfile,
} from '@orchestrator-ai/transport-types';
import { apiFetch, apiSend } from '@/modules/workflows/services/workflows-api.service';
import type { LlmModel } from '@/modules/settings/services/settings-api.service';

const base = (slug: string) => `/workflows/${encodeURIComponent(slug)}/admin`;
const section = (slug: string, key: string) => `${base(slug)}/sections/${encodeURIComponent(key)}`;
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

/** A workflow's admin, in the current organization (the API scopes it by RBAC org). */
export const workflowAdminApi = {
  view: (slug: string) => apiFetch<WorkflowAdminView>(base(slug)),

  saveAgent: (slug: string, agent: string, instructions: string | null) =>
    apiFetch<{ saved: true }>(`${base(slug)}/agents/${encodeURIComponent(agent)}`, json('PUT', { instructions })),
  agentHistory: (slug: string, agent: string) =>
    apiFetch<{ changes: WorkflowAdminAgentChange[] }>(`${base(slug)}/agents/${encodeURIComponent(agent)}/history`),

  rows: (slug: string, key: string) => apiFetch<{ rows: WorkflowAdminRow[] }>(section(slug, key)),
  create: (slug: string, key: string, row: WorkflowAdminRow) => apiFetch<WorkflowAdminRow>(section(slug, key), json('POST', { row })),
  update: (slug: string, key: string, id: string, row: WorkflowAdminRow) =>
    apiFetch<WorkflowAdminRow>(`${section(slug, key)}/${encodeURIComponent(id)}`, json('PUT', { row })),
  saveAll: (slug: string, key: string, rows: Array<{ id: string; row: WorkflowAdminRow }>) =>
    apiFetch<{ rows: WorkflowAdminRow[] }>(section(slug, key), json('PUT', { rows })),
  matrix: (slug: string, key: string) => apiFetch<WorkflowAdminMatrix>(`${section(slug, key)}/matrix`),
  saveMatrix: (slug: string, key: string, rows: Array<{ id: string; cells: Record<string, number> }>) =>
    apiFetch<WorkflowAdminMatrix>(`${section(slug, key)}/matrix`, json('PUT', { rows })),
  remove: (slug: string, key: string, id: string) => apiSend(`${section(slug, key)}/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  profiles: (slug: string) =>
    apiFetch<{ profiles: WorkflowModelProfile[] }>(`/workflows/admin/model-profiles?workflowSlug=${encodeURIComponent(slug)}`),
  saveProfile: (slug: string, role: string, provider: string, model: string) =>
    apiFetch<WorkflowModelProfile>('/workflows/admin/model-profiles', json('PUT', { workflowSlug: slug, role, provider, model })),
  models: () => apiFetch<LlmModel[]>('/admin/llm/models'),
};
