/** A workflow's brief, docs and showcase (read-only; they live with its code). */
import type { WorkflowBrief, WorkflowDoc, WorkflowDocName } from '@orchestrator-ai/transport-types';
import { apiFetch } from '@/modules/workflows/services/workflows-api.service';

export const workflowDocsClient = {
  getBrief: (slug: string, org: string) =>
    apiFetch<WorkflowBrief>(`/workflows/${encodeURIComponent(slug)}/brief`, { headers: { 'x-organization-slug': org } }),
  getDoc: (slug: string, name: WorkflowDocName, org: string) =>
    apiFetch<WorkflowDoc>(`/workflows/${encodeURIComponent(slug)}/docs/${name}`, {
      headers: { 'x-organization-slug': org },
    }),
};
