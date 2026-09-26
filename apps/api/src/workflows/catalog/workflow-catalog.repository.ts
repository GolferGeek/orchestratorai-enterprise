import { Inject, Injectable } from '@nestjs/common';
import {
  DATABASE_SERVICE,
  isWorkflowLifecycle,
  type DatabaseService,
  type WorkflowLifecycle,
} from '@orchestrator-ai/transport-types';
import type { CatalogWorkflow } from './workflow.registry';

export interface OrgWorkflowSetting {
  workflowSlug: string;
  enabled: boolean;
  lifecycle: WorkflowLifecycle;
  note: string | null;
}

export interface OrgGroup {
  id: string;
  name: string;
  position: number;
  /** In position order. */
  workflowSlugs: string[];
}

/** A caller-correctable problem with a catalog change; its message is shown. */
export class CatalogChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogChangeError';
  }
}

type Row = Record<string, unknown>;

@Injectable()
export class WorkflowCatalogRepository {
  constructor(@Inject(DATABASE_SERVICE) private readonly db: DatabaseService) {}

  /** Mirror the code registry; slugs no longer in code are kept inactive. */
  async syncRegistry(workflows: CatalogWorkflow[]): Promise<void> {
    const now = new Date().toISOString();
    await this.db.transaction(async (tx) => {
      const deactivated = await tx
        .from('workflows', 'registry')
        .update({ active: false, updated_at: now })
        .eq('active', true)
        .select('slug');
      if (deactivated.error) throw new Error(`Failed to sync the workflow registry: ${deactivated.error.message}`);
      for (const workflow of workflows) {
        const { error } = await tx.from('workflows', 'registry').upsert(
          {
            slug: workflow.slug,
            name: workflow.name,
            description: workflow.description ?? null,
            icon: workflow.icon,
            default_group: workflow.defaultGroup,
            default_lifecycle: workflow.defaultLifecycle,
            hitl: workflow.hitl,
            data_classification: workflow.dataClassification,
            entry_kind: workflow.entryPoint.kind,
            organization_slugs: workflow.organizationSlugs,
            active: true,
            updated_at: now,
          },
          { onConflict: 'slug' },
        );
        if (error) throw new Error(`Failed to register workflow ${workflow.slug}: ${error.message}`);
      }
    });
  }

  async settings(organizationSlug: string): Promise<OrgWorkflowSetting[]> {
    const { data, error } = await this.db
      .from('workflows', 'org_settings')
      .select('workflow_slug, enabled, lifecycle, note')
      .eq('organization_slug', organizationSlug);
    if (error) throw new Error(`Failed to read workflow settings of ${organizationSlug}: ${error.message}`);
    return this.rows(data).map((row) => {
      if (!isWorkflowLifecycle(row.lifecycle) || typeof row.enabled !== 'boolean') {
        throw new Error(`workflows.org_settings row for ${String(row.workflow_slug)} is malformed`);
      }
      return {
        workflowSlug: String(row.workflow_slug),
        enabled: row.enabled,
        lifecycle: row.lifecycle,
        note: typeof row.note === 'string' ? row.note : null,
      };
    });
  }

  async saveSetting(
    organizationSlug: string,
    setting: OrgWorkflowSetting,
    updatedBy: string,
  ): Promise<void> {
    const { error } = await this.db.from('workflows', 'org_settings').upsert(
      {
        organization_slug: organizationSlug,
        workflow_slug: setting.workflowSlug,
        enabled: setting.enabled,
        lifecycle: setting.lifecycle,
        note: setting.note,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_slug,workflow_slug' },
    );
    if (error) throw new Error(`Failed to save settings for ${setting.workflowSlug}: ${error.message}`);
  }

  async groups(organizationSlug: string): Promise<OrgGroup[]> {
    const [groups, items] = await Promise.all([
      this.db.from('workflows', 'groups').select('id, name, position').eq('organization_slug', organizationSlug).order('position'),
      this.db
        .from('workflows', 'group_items')
        .select('group_id, workflow_slug, position')
        .eq('organization_slug', organizationSlug)
        .order('position'),
    ]);
    if (groups.error) throw new Error(`Failed to read groups of ${organizationSlug}: ${groups.error.message}`);
    if (items.error) throw new Error(`Failed to read group items of ${organizationSlug}: ${items.error.message}`);
    const slugsByGroup = new Map<string, string[]>();
    for (const item of this.rows(items.data)) {
      const id = String(item.group_id);
      slugsByGroup.set(id, [...(slugsByGroup.get(id) ?? []), String(item.workflow_slug)]);
    }
    return this.rows(groups.data).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      position: Number(row.position),
      workflowSlugs: slugsByGroup.get(String(row.id)) ?? [],
    }));
  }

  async createGroup(organizationSlug: string, name: string): Promise<OrgGroup> {
    const existing = await this.groups(organizationSlug);
    const { data, error } = await this.db
      .from('workflows', 'groups')
      .insert({ organization_slug: organizationSlug, name, position: existing.length })
      .select('id, name, position');
    if (error) {
      if (error.message.includes('groups_name_per_org')) {
        throw new CatalogChangeError(`A group named "${name}" already exists`);
      }
      throw new Error(`Failed to create group ${name}: ${error.message}`);
    }
    const row = this.rows(data)[0];
    if (!row) throw new Error('Creating a group returned no row');
    return { id: String(row.id), name: String(row.name), position: Number(row.position), workflowSlugs: [] };
  }

  async renameGroup(organizationSlug: string, id: string, name: string): Promise<boolean> {
    const { data, error } = await this.db
      .from('workflows', 'groups')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_slug', organizationSlug)
      .select('id');
    if (error) {
      if (error.message.includes('groups_name_per_org')) {
        throw new CatalogChangeError(`A group named "${name}" already exists`);
      }
      throw new Error(`Failed to rename group ${id}: ${error.message}`);
    }
    return this.rows(data).length > 0;
  }

  async deleteGroup(organizationSlug: string, id: string): Promise<boolean> {
    const { data, error } = await this.db
      .from('workflows', 'groups')
      .delete()
      .eq('id', id)
      .eq('organization_slug', organizationSlug)
      .select('id');
    if (error) throw new Error(`Failed to delete group ${id}: ${error.message}`);
    return this.rows(data).length > 0;
  }

  /**
   * Replace the org's whole layout in one transaction: group order, and
   * which workflows sit in which group in which order. Groups not listed and
   * workflows not listed keep no position (workflows fall back to their
   * default group). Either all of it applies or none does.
   */
  async replaceLayout(
    organizationSlug: string,
    layout: Array<{ groupId: string; workflowSlugs: string[] }>,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.db.transaction(async (tx) => {
      const cleared = await tx
        .from('workflows', 'group_items')
        .delete()
        .eq('organization_slug', organizationSlug)
        .select('workflow_slug');
      if (cleared.error) throw new Error(`Failed to clear the layout: ${cleared.error.message}`);
      for (const [groupPosition, group] of layout.entries()) {
        const moved = await tx
          .from('workflows', 'groups')
          .update({ position: groupPosition, updated_at: now })
          .eq('id', group.groupId)
          .eq('organization_slug', organizationSlug)
          .select('id');
        if (moved.error) throw new Error(`Failed to order group ${group.groupId}: ${moved.error.message}`);
        if (this.rows(moved.data).length === 0) {
          throw new CatalogChangeError(`Group ${group.groupId} does not exist in this organization`);
        }
        if (group.workflowSlugs.length === 0) continue;
        const placed = await tx.from('workflows', 'group_items').insert(
          group.workflowSlugs.map((workflowSlug, position) => ({
            group_id: group.groupId,
            organization_slug: organizationSlug,
            workflow_slug: workflowSlug,
            position,
          })),
        );
        if (placed.error) throw new Error(`Failed to place workflows in group ${group.groupId}: ${placed.error.message}`);
      }
    });
  }

  private rows(data: unknown): Row[] {
    if (!Array.isArray(data)) throw new Error('workflows catalog query returned no row set');
    return data as Row[];
  }
}
