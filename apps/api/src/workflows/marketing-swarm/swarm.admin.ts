import type { WorkflowAdminField, WorkflowAdminMatrix, WorkflowAdminRow } from '@orchestrator-ai/transport-types';
import { AdminRowError, type WorkflowAdminSection } from '../shared/admin';
import type { OwnerKind, SwarmStoreService } from './swarm-store.service';

type Row = Record<string, unknown>;

/** A slug from a name, for rows the admin creates (the slug is what runs refer to). */
export function slugify(prefix: string, name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!base) throw new AdminRowError('The name needs a letter or a digit');
  return `${prefix}-${base}`.slice(0, 60).replace(/-+$/, '');
}

const common = {
  slug: { key: 'slug', label: 'Slug', kind: 'text', required: true, readOnly: true, help: 'Made from the name when added; runs refer to it.' } as WorkflowAdminField,
  name: { key: 'name', label: 'Name', kind: 'text', required: true, maxLength: 100 } as WorkflowAdminField,
  description: { key: 'description', label: 'Description', kind: 'text', required: false, maxLength: 300 } as WorkflowAdminField,
  active: { key: 'active', label: 'Offered in new runs', kind: 'boolean', required: true } as WorkflowAdminField,
  order: { key: 'order', label: 'Order', kind: 'number', required: true, min: 0, max: 1000 } as WorkflowAdminField,
};

/** Database errors an admin can act on, as their words. */
function readable(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('swarm_writers_known_model')) throw new AdminRowError('That provider and model are not in the model catalog');
  if (message.includes('duplicate key')) throw new AdminRowError('One with that name already exists');
  throw error instanceof Error ? error : new Error(message);
}

/**
 * The swarm's admin: writers (persona + model), editors (threshold) and their
 * weights, evaluators and their weights, facets and content types. Runs take
 * a snapshot at start, so an edit applies to the next run.
 */
export function swarmAdminSections(store: SwarmStoreService): WorkflowAdminSection[] {
  const listed = (table: string, map: (r: Row) => WorkflowAdminRow) => async (org: string) => (await store.select(table, org)).map(map);
  const save = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (error) {
      readable(error);
    }
  };
  const updated = async (table: string, org: string, key: string, row: Row, keyColumn = 'slug') => {
    let found = false;
    await save(async () => (found = await store.update(table, org, keyColumn, key, row)));
    if (!found) throw new AdminRowError(`No ${key}`);
  };

  const matrix = (kind: OwnerKind, ownerTable: string, help: string): WorkflowAdminSection['matrix'] => ({
    min: 0,
    max: 5,
    help,
    load: async (org): Promise<WorkflowAdminMatrix> => {
      const [owners, facets, weights] = await Promise.all([store.select(ownerTable, org), store.facets(org), store.weights(org, kind)]);
      const columns = facets.filter((f) => f.active && (kind === 'evaluator' || !f.evaluatorOnly));
      return {
        columns: columns.map((f) => ({ key: f.key, label: f.label, note: f.description })),
        rows: owners.map((o) => ({
          id: String(o.slug),
          title: String(o.name),
          cells: Object.fromEntries(columns.map((f) => [f.key, weights[String(o.slug)]?.[f.key] ?? 0])),
        })),
      };
    },
    save: async (org, rows) => {
      for (const r of rows) for (const [facet, w] of Object.entries(r.cells)) if (!Number.isInteger(w)) throw new AdminRowError(`${r.id} / ${facet}: weights are whole numbers from 0 to 5`);
      await store.saveWeights(org, kind, rows);
      return (await matrix(kind, ownerTable, help)!.load(org));
    },
  });

  return [
    {
      key: 'writers',
      label: 'Writers',
      description: 'Each writer drafts in its own persona on its own model. Pick which ones write in each run.',
      kind: 'list',
      idField: 'slug',
      titleField: 'name',
      fields: [
        common.slug, common.name, common.description,
        { key: 'persona', label: 'Persona', kind: 'textarea', required: true, maxLength: 4000, help: 'How this writer writes: voice, habits, what it is good at.' },
        { key: 'provider', label: 'Provider', kind: 'text', required: true, maxLength: 50, help: 'e.g. anthropic, openai, xai, openrouter, ollama' },
        { key: 'model', label: 'Model', kind: 'text', required: true, maxLength: 200, help: 'As in the model catalog, e.g. claude-sonnet-4-6' },
        common.active, common.order,
      ],
      list: listed('swarm_writers', (r) => ({ slug: String(r.slug), name: String(r.name), description: (r.description as string | null) ?? null, persona: String(r.persona), provider: String(r.provider), model: String(r.model), active: r.active === true, order: Number(r.display_order) })),
      create: async (org, row) => {
        const slug = slugify('writer', String(row.name));
        await save(() => store.insert('swarm_writers', { organization_slug: org, slug, name: row.name, description: row.description, persona: row.persona, provider: row.provider, model: row.model, active: row.active, display_order: row.order }));
        return { slug, ...row };
      },
      update: async (org, slug, row) => {
        await updated('swarm_writers', org, slug, { name: row.name, description: row.description, persona: row.persona, provider: row.provider, model: row.model, active: row.active, display_order: row.order });
        return { slug, ...row };
      },
      remove: (org, slug) => store.remove('swarm_writers', org, slug),
    },
    {
      key: 'editors',
      label: 'Editors',
      description: "An editor passes a draft when its weighted facet score reaches its threshold; otherwise the coach tells the writer what to fix. Set what each editor cares about under Editor weights.",
      kind: 'list',
      idField: 'slug',
      titleField: 'name',
      fields: [
        common.slug, common.name, common.description,
        { key: 'threshold', label: 'Passes at', kind: 'number', required: true, min: 0, max: 1, help: 'Weighted score (0-1) a draft needs, e.g. 0.7' },
        common.active, common.order,
      ],
      list: listed('swarm_editors', (r) => ({ slug: String(r.slug), name: String(r.name), description: (r.description as string | null) ?? null, threshold: Number(r.threshold), active: r.active === true, order: Number(r.display_order) })),
      create: async (org, row) => {
        const slug = slugify('editor', String(row.name));
        await save(() => store.insert('swarm_editors', { organization_slug: org, slug, name: row.name, description: row.description, threshold: row.threshold, active: row.active, display_order: row.order }));
        return { slug, ...row };
      },
      update: async (org, slug, row) => {
        await updated('swarm_editors', org, slug, { name: row.name, description: row.description, threshold: row.threshold, active: row.active, display_order: row.order });
        return { slug, ...row };
      },
      remove: async (org, slug) => {
        const removed = await store.remove('swarm_editors', org, slug);
        if (removed) await store.removeOwnerWeights(org, 'editor', slug);
        return removed;
      },
    },
    {
      key: 'editor-weights',
      label: 'Editor weights',
      description: 'How much each editor cares about each facet: 0 not at all, 5 most. Evaluator-only facets are not offered to editors.',
      kind: 'matrix',
      idField: '',
      titleField: '',
      fields: [],
      matrix: matrix('editor', 'swarm_editors', '0 = ignores it, 5 = cares most'),
    },
    {
      key: 'evaluators',
      label: 'Evaluators',
      description: 'Evaluators rank the final drafts by their weighted facet scores; the standings are the mean place across them. Set their weights under Evaluator weights.',
      kind: 'list',
      idField: 'slug',
      titleField: 'name',
      fields: [common.slug, common.name, common.description, common.active, common.order],
      list: listed('swarm_evaluators', (r) => ({ slug: String(r.slug), name: String(r.name), description: (r.description as string | null) ?? null, active: r.active === true, order: Number(r.display_order) })),
      create: async (org, row) => {
        const slug = slugify('evaluator', String(row.name));
        await save(() => store.insert('swarm_evaluators', { organization_slug: org, slug, name: row.name, description: row.description, active: row.active, display_order: row.order }));
        return { slug, ...row };
      },
      update: async (org, slug, row) => {
        await updated('swarm_evaluators', org, slug, { name: row.name, description: row.description, active: row.active, display_order: row.order });
        return { slug, ...row };
      },
      remove: async (org, slug) => {
        const removed = await store.remove('swarm_evaluators', org, slug);
        if (removed) await store.removeOwnerWeights(org, 'evaluator', slug);
        return removed;
      },
    },
    {
      key: 'evaluator-weights',
      label: 'Evaluator weights',
      description: 'How much each evaluator cares about each facet: 0 not at all, 5 most.',
      kind: 'matrix',
      idField: '',
      titleField: '',
      fields: [],
      matrix: matrix('evaluator', 'swarm_evaluators', '0 = ignores it, 5 = cares most'),
    },
    {
      key: 'facets',
      label: 'Facets',
      description: 'The questions every draft is scored on. Jev answers them (its rubrics live in orchestratorai-jev); length is measured against the content type.',
      kind: 'list',
      idField: 'key',
      titleField: 'label',
      fields: [
        { key: 'key', label: 'Key', kind: 'text', required: true, readOnly: true },
        { key: 'label', label: 'Label', kind: 'text', required: true, maxLength: 60 },
        { key: 'description', label: 'Question', kind: 'text', required: true, maxLength: 300 },
        { key: 'rubric', label: 'Jev rubric', kind: 'text', required: false, readOnly: true },
        { key: 'evaluatorOnly', label: 'Evaluators only', kind: 'boolean', required: true, help: 'Editors never coach toward it.' },
        common.active, common.order,
      ],
      list: async (org) => (await store.facets(org)).map((f) => ({ key: f.key, label: f.label, description: f.description, rubric: f.rubric ?? '(measured in code)', evaluatorOnly: f.evaluatorOnly, active: f.active, order: f.order })),
      update: async (org, key, row) => {
        await updated('swarm_facets', org, key, { label: row.label, description: row.description, evaluator_only: row.evaluatorOnly, active: row.active, display_order: row.order }, 'key');
        return { key, ...row };
      },
    },
    {
      key: 'content-types',
      label: 'Content types',
      description: 'What the swarm can write, with the guidance writers follow and the length the Right length facet measures.',
      kind: 'list',
      idField: 'slug',
      titleField: 'name',
      fields: [
        common.slug, common.name,
        { key: 'guidance', label: 'Guidance for writers', kind: 'textarea', required: true, maxLength: 4000 },
        { key: 'minWords', label: 'Min words', kind: 'number', required: true, min: 0, max: 20000 },
        { key: 'maxWords', label: 'Max words', kind: 'number', required: true, min: 1, max: 20000 },
        { key: 'maxChars', label: 'Max characters', kind: 'number', required: false, min: 1, max: 200000, help: 'Only where the platform caps characters (e.g. an X post).' },
        common.active, common.order,
      ],
      list: listed('swarm_content_types', (r) => ({ slug: String(r.slug), name: String(r.name), guidance: String(r.guidance), minWords: Number(r.min_words), maxWords: Number(r.max_words), maxChars: r.max_chars === null ? null : Number(r.max_chars), active: r.active === true, order: Number(r.display_order) })),
      create: async (org, row) => {
        lengths(row);
        const slug = slugify('type', String(row.name)).replace(/^type-/, '');
        await save(() => store.insert('swarm_content_types', { organization_slug: org, slug, name: row.name, guidance: row.guidance, min_words: row.minWords, max_words: row.maxWords, max_chars: row.maxChars, active: row.active, display_order: row.order }));
        return { slug, ...row };
      },
      update: async (org, slug, row) => {
        lengths(row);
        await updated('swarm_content_types', org, slug, { name: row.name, guidance: row.guidance, min_words: row.minWords, max_words: row.maxWords, max_chars: row.maxChars, active: row.active, display_order: row.order });
        return { slug, ...row };
      },
    },
  ];
}

function lengths(row: WorkflowAdminRow): void {
  if (Number(row.minWords) > Number(row.maxWords)) throw new AdminRowError('Min words must not be above max words');
  for (const k of ['minWords', 'maxWords', 'maxChars']) if (row[k] !== null && !Number.isInteger(row[k])) throw new AdminRowError(`${k} must be a whole number`);
}
