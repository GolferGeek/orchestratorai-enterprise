import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type {
  WorkflowCatalogEntry,
  WorkflowCatalogView,
  WorkflowGroupView,
} from '@orchestrator-ai/transport-types';
import { WorkflowCatalogRepository } from './workflow-catalog.repository';
import { WorkflowRegistry, type CatalogWorkflow } from './workflow.registry';

/**
 * The catalog as an org sees it: code registry + the org's settings + the
 * org's groups. Also mirrors the code registry into workflows.registry at
 * boot, after every workflow module has registered.
 */
@Injectable()
export class WorkflowCatalogService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WorkflowCatalogService.name);

  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly repo: WorkflowCatalogRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const all = this.registry.all();
    await this.repo.syncRegistry(all);
    this.logger.log(`Synced ${all.length} workflow(s) to workflows.registry`);
  }

  /**
   * The org's catalog. For "*" (a super-admin with no org selected) there
   * are no org settings or groups: code defaults, everything enabled.
   */
  async view(organizationSlug: string): Promise<WorkflowCatalogView> {
    const workflows = this.registry.list(organizationSlug);
    const isOrg = organizationSlug !== '*';
    const [settings, groups] = isOrg
      ? await Promise.all([this.repo.settings(organizationSlug), this.repo.groups(organizationSlug)])
      : [[], []];

    const visible = new Set(workflows.map((w) => w.slug));
    const settingBySlug = new Map(settings.map((s) => [s.workflowSlug, s]));
    const groupBySlug = new Map<string, string>();
    for (const group of groups) {
      for (const slug of group.workflowSlugs) groupBySlug.set(slug, group.name);
    }

    const entries: WorkflowCatalogEntry[] = workflows.map((workflow) => {
      const setting = settingBySlug.get(workflow.slug);
      return {
        slug: workflow.slug,
        name: workflow.name,
        description: workflow.description ?? null,
        icon: workflow.icon,
        hitl: workflow.hitl,
        dataClassification: workflow.dataClassification,
        lifecycle: setting ? setting.lifecycle : workflow.defaultLifecycle,
        enabled: setting ? setting.enabled : true,
        note: setting ? setting.note : null,
        group: groupBySlug.get(workflow.slug) ?? workflow.defaultGroup,
      };
    });

    // The org's groups first, in order; then default groups for workflows
    // the org has not placed, alphabetically.
    const views: WorkflowGroupView[] = groups.map((group) => ({
      id: group.id,
      name: group.name,
      position: group.position,
      workflowSlugs: group.workflowSlugs.filter((slug) => visible.has(slug)),
    }));
    const unplaced = workflows.filter((w) => !groupBySlug.has(w.slug));
    const defaults = new Map<string, string[]>();
    for (const workflow of unplaced) {
      const named = views.find((view) => view.name === workflow.defaultGroup);
      if (named) named.workflowSlugs.push(workflow.slug);
      else defaults.set(workflow.defaultGroup, [...(defaults.get(workflow.defaultGroup) ?? []), workflow.slug]);
    }
    for (const name of [...defaults.keys()].sort()) {
      views.push({ id: null, name, position: views.length, workflowSlugs: defaults.get(name) ?? [] });
    }
    return { workflows: entries, groups: views };
  }

  /** Whether the org may run the workflow (a disabled workflow refuses invocations). */
  async isEnabled(organizationSlug: string, workflow: CatalogWorkflow): Promise<boolean> {
    if (organizationSlug === '*') return true;
    const setting = (await this.repo.settings(organizationSlug)).find((s) => s.workflowSlug === workflow.slug);
    return setting ? setting.enabled : true;
  }
}
