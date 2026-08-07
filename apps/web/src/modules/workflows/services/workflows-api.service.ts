/**
 * Workflows API Service
 *
 * HTTP client for workflow catalog and run history (Workflows product sidebar).
 */

import { tokenStorage } from '@/services/tokenStorageService';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
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
    throw new Error(
      `Workflows API request failed with status ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

export interface WorkflowDefinition {
  slug: string;
  name: string;
  description?: string;
  organizationSlug?: string | null;
}

export interface WorkflowRunNavItem {
  taskId: string;
  conversationId: string;
  workflowSlug: string;
  status: string;
  contentTypeSlug: string;
  previewTitle: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

async function fetchWorkflows(orgSlug?: string): Promise<WorkflowDefinition[]> {
  const headers: Record<string, string> = {};
  if (orgSlug) {
    headers['x-organization-slug'] = orgSlug;
  }
  const result = await apiFetch<{
    status: string;
    workflows: WorkflowDefinition[];
  }>('/workflows', { headers });
  return result.workflows;
}

async function fetchWorkflowRuns(
  workflowSlug: string,
  orgSlug?: string,
): Promise<WorkflowRunNavItem[]> {
  const headers: Record<string, string> = {};
  if (orgSlug) {
    headers['x-organization-slug'] = orgSlug;
  }
  const result = await apiFetch<{ runs: WorkflowRunNavItem[] }>(
    `/workflows/${encodeURIComponent(workflowSlug)}/runs`,
    { headers },
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

export const workflowsApiService = {
  fetchWorkflows,
  fetchWorkflowRuns,
  deleteWorkflowRun,
};
