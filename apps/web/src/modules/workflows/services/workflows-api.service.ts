/**
 * Workflows API Service
 *
 * HTTP client for workflow catalog and run history (Workflows product sidebar).
 */

import type {
  ImprovementRequestView,
  ImprovementStatus,
  WorkflowCatalogView,
  WorkflowLifecycle,
  WorkflowRunSummary,
} from '@orchestrator-ai/transport-types';
import { tokenStorage } from '@/services/tokenStorageService';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/** Authenticated JSON call to the API, with the org header; throws the server's message. */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  return (await apiRequest(path, options)).json() as Promise<T>;
}

/** An authenticated call whose answer has no body (e.g. a DELETE answered 204). */
export async function apiSend(path: string, options: RequestInit = {}): Promise<void> {
  await apiRequest(path, options);
}

/** An authenticated file download: the bytes and the server's file name. */
export async function apiDownload(
  path: string,
  options: RequestInit = {},
): Promise<{ blob: Blob; fileName: string }> {
  const response = await apiRequest(path, options);
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const fileName = /filename="([^"]+)"/.exec(disposition)?.[1];
  if (!fileName) {
    throw new Error(`The download from ${path} did not name its file`);
  }
  return { blob: await response.blob(), fileName };
}

async function apiRequest(path: string, options: RequestInit): Promise<Response> {
  const token = await tokenStorage.getAccessToken();
  if (!token) {
    throw new Error('Authentication is required for the Workflows API');
  }
  const currentOrganization = localStorage.getItem('currentOrganization');
  const headers = new Headers(options.headers);
  if (currentOrganization && !headers.has('x-organization-slug')) {
    headers.set('x-organization-slug', currentOrganization);
  }
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(await failureMessage(response));
  }
  return response;
}

/** The server's own explanation when it gave one (NestJS `message`). */
async function failureMessage(response: Response): Promise<string> {
  const status = `Workflows API request failed with status ${response.status}`;
  const body: unknown = await response.json().catch(() => null);
  if (typeof body !== 'object' || body === null) return status;
  const message = (body as { message?: unknown }).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join('; ');
  return status;
}

export type WorkflowRunNavItem = WorkflowRunSummary;

export interface OrgWorkflowSetting {
  workflowSlug: string;
  enabled: boolean;
  lifecycle: WorkflowLifecycle;
  note: string | null;
}

export interface OrgWorkflowGroup {
  id: string;
  name: string;
  position: number;
  workflowSlugs: string[];
}

function orgHeaders(orgSlug?: string): Record<string, string> {
  return orgSlug ? { 'x-organization-slug': orgSlug } : {};
}

/** The org's catalog: workflows with its settings applied, and its nav groups. */
async function fetchCatalog(orgSlug?: string): Promise<WorkflowCatalogView> {
  return apiFetch<WorkflowCatalogView>('/workflows', { headers: orgHeaders(orgSlug) });
}

async function fetchWorkflowRuns(
  workflowSlug: string,
  orgSlug?: string,
): Promise<WorkflowRunNavItem[]> {
  const result = await apiFetch<{ runs: WorkflowRunNavItem[] }>(
    `/workflows/${encodeURIComponent(workflowSlug)}/runs`,
    { headers: orgHeaders(orgSlug) },
  );
  return result.runs;
}

async function deleteWorkflowRun(
  workflowSlug: string,
  conversationId: string,
): Promise<void> {
  await apiFetch<{ deleted: boolean }>(
    `/workflows/${encodeURIComponent(workflowSlug)}/runs/${encodeURIComponent(conversationId)}`,
    { method: 'DELETE' },
  );
}

async function saveSetting(
  workflowSlug: string,
  change: Partial<Pick<OrgWorkflowSetting, 'enabled' | 'lifecycle' | 'note'>>,
): Promise<OrgWorkflowSetting> {
  return apiFetch<OrgWorkflowSetting>(
    `/workflows/admin/settings/${encodeURIComponent(workflowSlug)}`,
    { method: 'PATCH', body: JSON.stringify(change) },
  );
}

async function fetchGroups(): Promise<OrgWorkflowGroup[]> {
  return (await apiFetch<{ groups: OrgWorkflowGroup[] }>('/workflows/admin/groups')).groups;
}

async function createGroup(name: string): Promise<OrgWorkflowGroup> {
  return apiFetch<OrgWorkflowGroup>('/workflows/admin/groups', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

async function renameGroup(id: string, name: string): Promise<void> {
  await apiFetch(`/workflows/admin/groups/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

async function deleteGroup(id: string): Promise<void> {
  await apiFetch(`/workflows/admin/groups/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Replace the org's whole layout at once (group order and placements). */
async function saveLayout(
  groups: Array<{ groupId: string; workflowSlugs: string[] }>,
): Promise<void> {
  await apiFetch('/workflows/admin/layout', { method: 'PUT', body: JSON.stringify({ groups }) });
}

/** The org's improvement requests (admin), newest first; all of them without a status. */
async function fetchImprovements(status?: ImprovementStatus): Promise<ImprovementRequestView[]> {
  return apiFetch<ImprovementRequestView[]>(
    `/workflows/admin/improvement-requests${status ? `?status=${status}` : ''}`,
  );
}

async function decideImprovement(
  id: string,
  status: ImprovementStatus,
  adminNotes: string | null,
): Promise<ImprovementRequestView> {
  return apiFetch<ImprovementRequestView>(`/workflows/admin/improvement-requests/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, adminNotes }),
  });
}

export const workflowsApiService = {
  fetchImprovements,
  decideImprovement,
  fetchCatalog,
  fetchWorkflowRuns,
  deleteWorkflowRun,
  saveSetting,
  fetchGroups,
  createGroup,
  renameGroup,
  deleteGroup,
  saveLayout,
};
