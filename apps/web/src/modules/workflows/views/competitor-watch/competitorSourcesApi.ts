import { apiFetch } from '@/modules/workflows/services/workflows-api.service';

export interface CompetitorSource {
  id: string;
  competitor: string;
  page: string;
  url: string;
  enabled: boolean;
}

const base = '/workflows/competitor-watch/sources';

/** The pages the org follows (managed in the workflow's admin). */
export const competitorSourcesApi = {
  list: () => apiFetch<CompetitorSource[]>(base),
};
