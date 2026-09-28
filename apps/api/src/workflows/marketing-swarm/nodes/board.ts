import type { JsonValue } from '@orchestrator-ai/transport-types';
import { latest, type SwarmState } from '../swarm.state';

/**
 * The live board the page shows while the run is going: each writer's
 * draft, where it is, its facet scores and each editor's verdict, then the
 * standings once they exist.
 */
export function board(state: SwarmState): JsonValue {
  const config = state.config!;
  const facetLabels = Object.fromEntries(config.facets.map((f) => [f.key, f.label]));
  return {
    cycle: state.cycle,
    maxEditCycles: state.input!.maxEditCycles,
    facets: config.facets.map((f) => ({ key: f.key, label: f.label, evaluatorOnly: f.evaluatorOnly })),
    editors: config.editors.map((e) => ({ slug: e.slug, name: e.name, threshold: e.threshold })),
    evaluators: config.evaluators.map((e) => ({ slug: e.slug, name: e.name })),
    drafts: state.drafts.map((d) => {
      const writer = config.writers.find((w) => w.slug === d.writer)!;
      const v = latest(d);
      return {
        writer: d.writer,
        name: writer.name,
        model: `${writer.provider}/${writer.model}`,
        status: d.status,
        error: d.error,
        version: v?.n ?? 0,
        text: v?.text ?? null,
        scores: v ? Object.fromEntries(Object.entries(v.scores).map(([k, s]) => [k, { label: facetLabels[k] ?? k, score: s.score }])) : {},
        editors: v?.editors ?? {},
      };
    }),
    standings: (state.standings ?? null) as unknown as JsonValue,
  } as unknown as JsonValue;
}
