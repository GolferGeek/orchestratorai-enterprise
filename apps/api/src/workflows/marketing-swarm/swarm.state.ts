import { Annotation } from '@langchain/langgraph';
import { runtimeStateChannels } from '../shared/runs';
import type { ContentTypeLimits, FacetScore, Standing, SwarmFacet, Weights } from './scoring';
import type { SwarmInput } from './swarm.input';

export interface SwarmWriter { slug: string; name: string; persona: string; provider: string; model: string }
export interface SwarmEditor { slug: string; name: string; threshold: number; weights: Weights }
export interface SwarmEvaluator { slug: string; name: string; weights: Weights }
export interface SwarmContentType extends ContentTypeLimits { slug: string; name: string; guidance: string }

/** What the org had configured when the run started (later admin edits do not change a run). */
export interface SwarmConfig {
  contentType: SwarmContentType;
  writers: SwarmWriter[];
  editors: SwarmEditor[];
  evaluators: SwarmEvaluator[];
  facets: SwarmFacet[];
  brief: string;
  evidence: string;
}

export interface DraftVersion {
  n: number;
  text: string;
  /** Facet key -> score; empty until checked. */
  scores: Record<string, FacetScore>;
  /** Editor slug -> composite and verdict; empty until gated. */
  editors: Record<string, { score: number; pass: boolean }>;
  /** The coach's feedback on this version (null unless it went back for a rewrite). */
  feedback: string | null;
}

export interface Draft {
  writer: string;
  status: 'writing' | 'failed' | 'scoring' | 'revising' | 'approved' | 'final';
  error: string | null;
  versions: DraftVersion[];
}

export const SwarmStateAnnotation = Annotation.Root({
  ...runtimeStateChannels,
  input: Annotation<SwarmInput | null>({ reducer: (_, n) => n, default: () => null }),
  config: Annotation<SwarmConfig | null>({ reducer: (_, n) => n, default: () => null }),
  drafts: Annotation<Draft[]>({ reducer: (_, n) => n, default: () => [] }),
  cycle: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  standings: Annotation<Standing[] | null>({ reducer: (_, n) => n, default: () => null }),
  pickRound: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  winner: Annotation<{ writer: string; text: string; edited: boolean } | null>({ reducer: (_, n) => n, default: () => null }),
  /** Set when the reviewer declined every finalist. */
  declined: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
});

export type SwarmState = typeof SwarmStateAnnotation.State;

export const latest = (d: Draft): DraftVersion | undefined => d.versions[d.versions.length - 1];
