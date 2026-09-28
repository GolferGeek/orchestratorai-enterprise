import type { JsonValue } from '@orchestrator-ai/transport-types';
import type { Standing } from './scoring';
import type { Draft, SwarmConfig, SwarmState } from './swarm.state';

export interface SwarmResult {
  topic: string;
  contentType: { slug: string; name: string };
  brief: string;
  writers: Array<{ slug: string; name: string; model: string }>;
  editors: Array<{ slug: string; name: string; threshold: number }>;
  evaluators: Array<{ slug: string; name: string }>;
  facets: Array<{ key: string; label: string; evaluatorOnly: boolean }>;
  drafts: Draft[];
  standings: Standing[];
  winner: { writer: string; text: string; edited: boolean } | null;
  declined: string | null;
}

export function swarmResult(state: SwarmState): JsonValue {
  const cfg: SwarmConfig | null = state.config;
  if (!cfg || !state.input || !state.standings) throw new Error('The swarm finished without its configuration or standings. This is a bug.');
  if (!state.winner && !state.declined) throw new Error('The swarm finished with neither a winner nor a reason for none. This is a bug.');
  const result: SwarmResult = {
    topic: state.input.brief.topic,
    contentType: { slug: cfg.contentType.slug, name: cfg.contentType.name },
    brief: cfg.brief,
    writers: cfg.writers.map((w) => ({ slug: w.slug, name: w.name, model: `${w.provider}/${w.model}` })),
    editors: cfg.editors.map((e) => ({ slug: e.slug, name: e.name, threshold: e.threshold })),
    evaluators: cfg.evaluators.map((e) => ({ slug: e.slug, name: e.name })),
    facets: cfg.facets.map((f) => ({ key: f.key, label: f.label, evaluatorOnly: f.evaluatorOnly })),
    drafts: state.drafts,
    standings: state.standings,
    winner: state.winner,
    declined: state.declined,
  };
  return result as unknown as JsonValue;
}
