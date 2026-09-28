import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_SERVICE, type DatabaseService, type WorkflowAdminRow } from '@orchestrator-ai/transport-types';
import { AdminRowError, type WorkflowAdminSection } from '../shared/admin';
import { DECISION_RISK_SLUG } from './decision-risk.handler';

type Row = Record<string, unknown>;

function rows(data: unknown, what: string): Row[] {
  if (!Array.isArray(data)) throw new Error(`${what} returned no row set`);
  return data as Row[];
}

/**
 * Decision Risk's admin sections: the org's scope thresholds, and its
 * dimensions (weight, order, active, and the assessor prompt). A prompt
 * change is a new version of the dimension's context; runs use the newest.
 */
@Injectable()
export class DecisionRiskAdmin {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  sections(): WorkflowAdminSection[] {
    return [
      {
        key: 'thresholds',
        label: 'Thresholds',
        description: 'Scores (0-100) at which a dimension is flagged for mitigation, the red team debates, and an alert is raised.',
        kind: 'single',
        idField: 'id',
        titleField: 'id',
        fields: [
          { key: 'id', label: 'Scope', kind: 'text', required: true, readOnly: true },
          { key: 'flagged', label: 'Flagged at', kind: 'number', required: true, min: 0, max: 100, help: 'A dimension at or above this gets a mitigation.' },
          { key: 'debate', label: 'Debate at', kind: 'number', required: true, min: 0, max: 100, help: 'A composite at or above this goes to the red team.' },
          { key: 'alert', label: 'Alert at', kind: 'number', required: true, min: 0, max: 100 },
        ],
        list: async (org) => [await this.thresholds(org)],
        update: (org, _id, row) => this.saveThresholds(org, row),
      },
      {
        key: 'dimensions',
        label: 'Dimensions',
        description: 'The risk dimensions assessed independently, their weight in the composite, and the prompt each assessor follows.',
        kind: 'list',
        idField: 'slug',
        titleField: 'name',
        fields: [
          { key: 'slug', label: 'Slug', kind: 'text', required: true, readOnly: true },
          { key: 'name', label: 'Name', kind: 'text', required: true, maxLength: 100 },
          { key: 'description', label: 'Description', kind: 'textarea', required: false, maxLength: 1000 },
          { key: 'weight', label: 'Weight', kind: 'number', required: true, min: 0, max: 1, help: 'Relative weight in the composite (0-1).' },
          { key: 'order', label: 'Order', kind: 'number', required: true, min: 0, max: 1000 },
          { key: 'active', label: 'Active', kind: 'boolean', required: true },
          { key: 'prompt', label: 'Assessor prompt', kind: 'textarea', required: true, maxLength: 8000, help: 'Saving a changed prompt makes a new version; earlier runs keep theirs.' },
          { key: 'version', label: 'Prompt version', kind: 'number', required: true, readOnly: true },
        ],
        list: (org) => this.dimensions(org),
        update: (org, slug, row) => this.saveDimension(org, slug, row),
        bulk: {
          label: 'Weights',
          fields: ['weight', 'active'],
          save: (org, rows) => this.saveWeights(org, rows),
        },
      },
    ];
  }

  private async scope(org: string): Promise<Row> {
    const { data, error } = await this.db.from('risk', 'scopes').select('id, thresholds').eq('organization_slug', org).eq('agent_slug', DECISION_RISK_SLUG).eq('is_active', true);
    if (error) throw new Error(`Failed to read ${org}'s risk scope: ${error.message}`);
    const scope = rows(data, 'risk scope')[0];
    if (!scope) throw new AdminRowError(`${org} has no active Decision Risk scope`);
    return scope;
  }

  private async thresholds(org: string): Promise<WorkflowAdminRow> {
    const scope = await this.scope(org);
    const t = (scope.thresholds ?? {}) as Record<string, unknown>;
    for (const key of ['flagged', 'debate', 'alert']) {
      if (typeof t[key] !== 'number') throw new Error(`${org}'s risk scope has no ${key} threshold`);
    }
    return { id: String(scope.id), flagged: t.flagged as number, debate: t.debate as number, alert: t.alert as number };
  }

  private async saveThresholds(org: string, row: WorkflowAdminRow): Promise<WorkflowAdminRow> {
    const { flagged, debate, alert } = row as { flagged: number; debate: number; alert: number };
    if (flagged > alert || debate > alert) throw new AdminRowError('Flagged and debate thresholds must not be above the alert threshold');
    const scope = await this.scope(org);
    const thresholds = { ...((scope.thresholds ?? {}) as Record<string, unknown>), flagged, debate, alert };
    const { error } = await this.db.from('risk', 'scopes').update({ thresholds, updated_at: new Date().toISOString() }).eq('id', String(scope.id));
    if (error) throw new Error(`Failed to save the thresholds: ${error.message}`);
    return this.thresholds(org);
  }

  private async dimensions(org: string): Promise<WorkflowAdminRow[]> {
    const scope = await this.scope(org);
    const dims = await this.db.from('risk', 'dimensions').select('id, slug, name, description, weight, display_order, is_active').eq('scope_id', String(scope.id)).order('display_order', { ascending: true });
    if (dims.error) throw new Error(`Failed to read dimensions: ${dims.error.message}`);
    const list = rows(dims.data, 'dimensions');
    if (!list.length) return [];
    const contexts = await this.db.from('risk', 'dimension_contexts').select('dimension_id, system_prompt, version').in('dimension_id', list.map((d) => String(d.id))).eq('is_active', true).order('version', { ascending: false });
    if (contexts.error) throw new Error(`Failed to read dimension prompts: ${contexts.error.message}`);
    const newest = new Map<string, Row>();
    for (const c of rows(contexts.data, 'dimension prompts')) if (!newest.has(String(c.dimension_id))) newest.set(String(c.dimension_id), c);
    return list.map((d) => {
      const ctx = newest.get(String(d.id));
      if (!ctx) throw new Error(`Dimension ${String(d.slug)} has no active prompt`);
      return {
        slug: String(d.slug),
        name: String(d.name),
        description: typeof d.description === 'string' ? d.description : null,
        weight: Number(d.weight),
        order: Number(d.display_order),
        active: d.is_active === true,
        prompt: String(ctx.system_prompt),
        version: Number(ctx.version),
      };
    });
  }

  /** Weight and active for every dimension at once: the active weights must add up to 1. */
  private async saveWeights(org: string, rows: Array<{ id: string; row: WorkflowAdminRow }>): Promise<WorkflowAdminRow[]> {
    const current = await this.dimensions(org);
    const bySlug = new Map(rows.map((r) => [r.id, r.row as { weight: number; active: boolean }]));
    const unknown = [...bySlug.keys()].filter((slug) => !current.some((d) => d.slug === slug));
    if (unknown.length) throw new AdminRowError(`No dimension ${unknown.join(', ')}`);
    const next = current.map((d) => ({ slug: String(d.slug), ...(bySlug.get(String(d.slug)) ?? { weight: Number(d.weight), active: d.active === true }) }));
    const active = next.filter((d) => d.active);
    if (!active.length) throw new AdminRowError('At least one dimension must stay active');
    const total = active.reduce((sum, d) => sum + d.weight, 0);
    if (Math.abs(total - 1) > 0.01) throw new AdminRowError(`The active weights add up to ${total.toFixed(2)}; they must add up to 1.00`);
    const scope = await this.scope(org);
    await this.db.transaction(async (tx) => {
      for (const d of next) {
        const { error } = await tx.from('risk', 'dimensions').update({ weight: d.weight, is_active: d.active }).eq('scope_id', String(scope.id)).eq('slug', d.slug);
        if (error) throw new Error(`Failed to save ${d.slug}'s weight: ${error.message}`);
      }
    });
    return this.dimensions(org);
  }

  private async saveDimension(org: string, slug: string, row: WorkflowAdminRow): Promise<WorkflowAdminRow> {
    const current = (await this.dimensions(org)).find((d) => d.slug === slug);
    if (!current) throw new AdminRowError(`No dimension ${slug}`);
    const next = row as { name: string; description: string | null; order: number; prompt: string };
    const scope = await this.scope(org);
    await this.db.transaction(async (tx) => {
      const dim = await tx.from('risk', 'dimensions').select('id').eq('scope_id', String(scope.id)).eq('slug', slug);
      if (dim.error) throw new Error(`Failed to read dimension ${slug}: ${dim.error.message}`);
      const id = String(rows(dim.data, 'dimension')[0]!.id);
      const updated = await tx
        .from('risk', 'dimensions')
        .update({ name: next.name, description: next.description, display_order: next.order })
        .eq('id', id);
      if (updated.error) throw new Error(`Failed to save dimension ${slug}: ${updated.error.message}`);
      if (next.prompt !== current.prompt) {
        const retired = await tx.from('risk', 'dimension_contexts').update({ is_active: false, updated_at: new Date().toISOString() }).eq('dimension_id', id).eq('is_active', true);
        if (retired.error) throw new Error(`Failed to retire ${slug}'s prompt: ${retired.error.message}`);
        const added = await tx.from('risk', 'dimension_contexts').insert({ dimension_id: id, version: Number(current.version) + 1, system_prompt: next.prompt, is_active: true });
        if (added.error) throw new Error(`Failed to save ${slug}'s new prompt: ${added.error.message}`);
      }
    });
    return (await this.dimensions(org)).find((d) => d.slug === slug)!;
  }
}
