import type { Logger } from '@nestjs/common';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { WorkUnitService } from '../../shared/work-units';
import type { DecisionRiskState, Mitigation } from '../decision-risk.state';
import { propositionInput, reportProgress, scopeOf } from './run-context';

/** The consolidator's output (its agent contract enforces the shape). */
export interface ConsolidatedMitigations {
  proposals: Array<{ dimension: string; proposal: string }>;
}

/**
 * The proposers each see one dimension, so they repeat actions that cover
 * several (e.g. "engage local legal counsel" under legal, regulatory and
 * people). One consolidator reads them all and rewrites each proposal so a
 * shared action is stated once and the others refer to it. Residual scores,
 * effort and rationale stay the proposers'; only the wording is consolidated.
 * One flagged dimension has nothing to consolidate.
 */
export function createConsolidateMitigationsNode(deps: { units: WorkUnitService; logger: Logger }) {
  return async (state: DecisionRiskState, config: LangGraphRunnableConfig): Promise<Partial<DecisionRiskState>> => {
    if (state.mitigations.length < 2) {
      deps.logger.log('Fewer than two mitigations; nothing to consolidate.');
      return {};
    }
    await reportProgress(config, 'consolidate_mitigations', 82, `Consolidating ${state.mitigations.length} mitigations`);
    const nameBySlug = new Map(state.dimensions.map((d) => [d.slug, d.name]));
    const output = await deps.units.runSolo<ConsolidatedMitigations>(scopeOf(state), {
      slug: 'consolidate-mitigations',
      agent: 'risk-mitigation-consolidator',
      input: {
        ...propositionInput(state),
        proposals: state.mitigations.map((m) => ({
          dimension: m.dimensionSlug,
          name: nameBySlug.get(m.dimensionSlug) ?? m.dimensionSlug,
          proposal: m.proposal,
          rationale: m.rationale,
        })),
      },
    });
    return { mitigations: applyConsolidation(state.mitigations, output) };
  };
}

/** Each mitigation with its consolidated wording; the consolidator must return every dimension exactly once. */
export function applyConsolidation(mitigations: Mitigation[], output: ConsolidatedMitigations): Mitigation[] {
  const bySlug = new Map<string, string>();
  for (const p of output.proposals) {
    if (bySlug.has(p.dimension)) throw new Error(`The consolidator returned '${p.dimension}' twice.`);
    bySlug.set(p.dimension, p.proposal.trim());
  }
  const expected = new Set(mitigations.map((m) => m.dimensionSlug));
  const unknown = [...bySlug.keys()].filter((slug) => !expected.has(slug));
  const missing = [...expected].filter((slug) => !bySlug.has(slug));
  if (unknown.length || missing.length) {
    throw new Error(`The consolidator must return exactly the proposed dimensions (missing: ${missing.join(', ') || 'none'}; unknown: ${unknown.join(', ') || 'none'}).`);
  }
  return mitigations.map((m) => {
    const proposal = bySlug.get(m.dimensionSlug)!;
    if (!proposal) throw new Error(`The consolidator returned an empty proposal for '${m.dimensionSlug}'.`);
    return { ...m, proposal };
  });
}
