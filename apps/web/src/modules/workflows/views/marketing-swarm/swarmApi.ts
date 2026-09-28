import { apiFetch } from '@/modules/workflows/services/workflows-api.service';

/** What the org offers for a new run (GET /workflows/marketing-swarm/options). */
export interface SwarmOptions {
  contentTypes: Array<{ slug: string; name: string; minWords: number; maxWords: number; maxChars: number | null }>;
  writers: Array<{ slug: string; name: string; description: string | null; model: string }>;
  editors: Array<{ slug: string; name: string; description: string | null }>;
  evaluators: Array<{ slug: string; name: string; description: string | null }>;
}

export interface FacetRef { key: string; label: string; evaluatorOnly: boolean }
export interface Standing {
  writer: string;
  byEvaluator: Record<string, { score: number; place: number }>;
  averagePlace: number;
  averageScore: number;
  place: number;
}

/** The live board a running swarm publishes (swarm board.ts). */
export interface SwarmBoard {
  cycle: number;
  maxEditCycles: number;
  facets: FacetRef[];
  editors: Array<{ slug: string; name: string; threshold: number }>;
  evaluators: Array<{ slug: string; name: string }>;
  drafts: Array<{
    writer: string;
    name: string;
    model: string;
    status: 'writing' | 'failed' | 'scoring' | 'revising' | 'approved' | 'final';
    error: string | null;
    version: number;
    text: string | null;
    scores: Record<string, { label: string; score: number }>;
    editors: Record<string, { score: number; pass: boolean }>;
  }>;
  standings: Standing[] | null;
}

export interface DraftVersion {
  n: number;
  text: string;
  scores: Record<string, { score: number; reason: string }>;
  editors: Record<string, { score: number; pass: boolean }>;
  feedback: string | null;
}

/** A finished swarm (swarm.result.ts). */
export interface SwarmRunResult {
  topic: string;
  contentType: { slug: string; name: string };
  brief: string;
  writers: Array<{ slug: string; name: string; model: string }>;
  editors: Array<{ slug: string; name: string; threshold: number }>;
  evaluators: Array<{ slug: string; name: string }>;
  facets: FacetRef[];
  drafts: Array<{ writer: string; status: string; error: string | null; versions: DraftVersion[] }>;
  standings: Standing[];
  winner: { writer: string; text: string; edited: boolean } | null;
  declined: string | null;
}

export const swarmApi = {
  options: () => apiFetch<SwarmOptions>('/workflows/marketing-swarm/options'),
};
