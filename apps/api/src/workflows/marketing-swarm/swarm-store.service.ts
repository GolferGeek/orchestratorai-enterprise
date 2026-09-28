import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_SERVICE, type DatabaseService } from '@orchestrator-ai/transport-types';
import type { SwarmFacet, Weights } from './scoring';
import type { SwarmContentType, SwarmEditor, SwarmEvaluator, SwarmWriter } from './swarm.state';

type Row = Record<string, unknown>;

export type OwnerKind = 'editor' | 'evaluator';

/** A choice in a run's input that the org does not have (or has switched off). */
export class SwarmConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SwarmConfigError';
  }
}

function rows(data: unknown, what: string): Row[] {
  if (!Array.isArray(data)) throw new Error(`${what} returned no row set`);
  return data as Row[];
}

const toFacet = (r: Row): SwarmFacet & { description: string; active: boolean; order: number } => ({
  key: String(r.key),
  label: String(r.label),
  description: String(r.description),
  source: r.source === 'length' ? 'length' : 'jev',
  rubric: typeof r.rubric === 'string' ? r.rubric : null,
  question: typeof r.question === 'string' ? r.question : null,
  inputs: (r.inputs ?? null) as SwarmFacet['inputs'],
  polarity: r.polarity === 'negative' ? 'negative' : 'positive',
  evaluatorOnly: r.evaluator_only === true,
  active: r.active === true,
  order: Number(r.display_order),
});

/**
 * The swarm's configuration in the marketing schema: facets, content types,
 * writers, editors, evaluators and their weights. Org-scoped throughout.
 */
@Injectable()
export class SwarmStoreService {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  async select(table: string, org: string, order = 'display_order'): Promise<Row[]> {
    const { data, error } = await this.db.from('marketing', table).select('*').eq('organization_slug', org).order(order, { ascending: true });
    if (error) throw new Error(`Failed to read marketing.${table}: ${error.message}`);
    return rows(data, `marketing.${table}`);
  }

  async facets(org: string) {
    return (await this.select('swarm_facets', org)).map(toFacet);
  }

  async weights(org: string, kind: OwnerKind): Promise<Record<string, Weights>> {
    const { data, error } = await this.db.from('marketing', 'swarm_weights').select('owner_slug, facet_key, weight').eq('organization_slug', org).eq('owner_kind', kind);
    if (error) throw new Error(`Failed to read ${kind} weights: ${error.message}`);
    const out: Record<string, Weights> = {};
    for (const r of rows(data, 'weights')) (out[String(r.owner_slug)] ??= {})[String(r.facet_key)] = Number(r.weight);
    return out;
  }

  /** Replace an owner's weights (zero weights are not stored). */
  async saveWeights(org: string, kind: OwnerKind, rowsToSave: Array<{ id: string; cells: Record<string, number> }>): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const r of rowsToSave) {
        const del = await tx.from('marketing', 'swarm_weights').delete().eq('organization_slug', org).eq('owner_kind', kind).eq('owner_slug', r.id);
        if (del.error) throw new Error(`Failed to clear ${r.id}'s weights: ${del.error.message}`);
        const keep = Object.entries(r.cells).filter(([, w]) => w > 0);
        if (!keep.length) continue;
        const ins = await tx.from('marketing', 'swarm_weights').insert(keep.map(([facet, weight]) => ({ organization_slug: org, owner_kind: kind, owner_slug: r.id, facet_key: facet, weight })));
        if (ins.error) throw new Error(`Failed to save ${r.id}'s weights: ${ins.error.message}`);
      }
    });
  }

  /**
   * What a run uses, by the slugs its input chose: each must exist and be
   * active in the org, and every editor and evaluator must weight something
   * that is active.
   */
  async runConfig(org: string, choice: { contentType: string; writers: string[]; editors: string[]; evaluators: string[] }): Promise<{
    contentType: SwarmContentType;
    writers: SwarmWriter[];
    editors: SwarmEditor[];
    evaluators: SwarmEvaluator[];
    facets: SwarmFacet[];
  }> {
    const [types, writers, editors, evaluators, facets, editorWeights, evaluatorWeights] = await Promise.all([
      this.select('swarm_content_types', org),
      this.select('swarm_writers', org),
      this.select('swarm_editors', org),
      this.select('swarm_evaluators', org),
      this.facets(org),
      this.weights(org, 'editor'),
      this.weights(org, 'evaluator'),
    ]);
    const pick = (list: Row[], slugs: string[], what: string) =>
      slugs.map((slug) => {
        const row = list.find((r) => r.slug === slug);
        if (!row) throw new SwarmConfigError(`The ${what} "${slug}" does not exist in ${org}`);
        if (row.active !== true) throw new SwarmConfigError(`The ${what} "${slug}" is switched off in ${org}`);
        return row;
      });
    const [ct] = pick(types, [choice.contentType], 'content type');
    const active = facets.filter((f) => f.active);
    const activeKeys = new Set(active.map((f) => f.key));
    const usable = (weights: Weights | undefined, owner: string, allowEvaluatorOnly: boolean): Weights => {
      const out: Weights = {};
      for (const [key, w] of Object.entries(weights ?? {})) {
        const f = active.find((x) => x.key === key);
        if (f && w > 0 && (allowEvaluatorOnly || !f.evaluatorOnly)) out[key] = w;
      }
      if (!Object.keys(out).length) throw new SwarmConfigError(`${owner} weights no active facet; set its weights in the workflow's admin`);
      return out;
    };
    return {
      contentType: {
        slug: String(ct!.slug), name: String(ct!.name), guidance: String(ct!.guidance),
        minWords: Number(ct!.min_words), maxWords: Number(ct!.max_words), maxChars: ct!.max_chars === null ? null : Number(ct!.max_chars),
      },
      writers: pick(writers, choice.writers, 'writer').map((w) => ({ slug: String(w.slug), name: String(w.name), persona: String(w.persona), provider: String(w.provider), model: String(w.model) })),
      editors: pick(editors, choice.editors, 'editor').map((e) => ({ slug: String(e.slug), name: String(e.name), threshold: Number(e.threshold), weights: usable(editorWeights[String(e.slug)], `The editor "${String(e.name)}"`, false) })),
      evaluators: pick(evaluators, choice.evaluators, 'evaluator').map((e) => ({ slug: String(e.slug), name: String(e.name), weights: usable(evaluatorWeights[String(e.slug)], `The evaluator "${String(e.name)}"`, true) })),
      facets: active.filter((f) => activeKeys.has(f.key)).map(({ description: _d, active: _a, order: _o, ...f }) => f),
    };
  }

  async insert(table: string, row: Row): Promise<void> {
    const { error } = await this.db.from('marketing', table).insert(row);
    if (error) throw new Error(error.message);
  }

  async update(table: string, org: string, keyColumn: string, key: string, row: Row): Promise<boolean> {
    const { data, error } = await this.db.from('marketing', table).update(row).eq('organization_slug', org).eq(keyColumn, key).select(keyColumn);
    if (error) throw new Error(error.message);
    return rows(data, table).length > 0;
  }

  async remove(table: string, org: string, key: string): Promise<boolean> {
    const { data, error } = await this.db.from('marketing', table).delete().eq('organization_slug', org).eq('slug', key).select('slug');
    if (error) throw new Error(error.message);
    return rows(data, table).length > 0;
  }

  /** Weights belong to their editor or evaluator; they go when it goes. */
  async removeOwnerWeights(org: string, kind: OwnerKind, slug: string): Promise<void> {
    const { error } = await this.db.from('marketing', 'swarm_weights').delete().eq('organization_slug', org).eq('owner_kind', kind).eq('owner_slug', slug);
    if (error) throw new Error(`Failed to remove ${slug}'s weights: ${error.message}`);
  }
}
