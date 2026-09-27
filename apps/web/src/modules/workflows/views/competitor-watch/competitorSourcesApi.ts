import { apiFetch, apiSend } from '@/modules/workflows/services/workflows-api.service';

export interface CompetitorSource {
  id: string;
  competitor: string;
  page: string;
  url: string;
  enabled: boolean;
}

const base = '/workflows/competitor-watch/sources';

/** The pages the org follows (the RBAC org from the current organization). */
export const competitorSourcesApi = {
  list: () => apiFetch<CompetitorSource[]>(base),
  add: (source: { competitor: string; page: string; url: string }) =>
    apiFetch<CompetitorSource>(base, { method: 'POST', body: JSON.stringify(source) }),
  remove: (id: string) => apiSend(`${base}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
