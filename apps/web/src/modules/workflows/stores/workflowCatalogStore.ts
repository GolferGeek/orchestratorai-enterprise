/**
 * The workflow catalog for the current org: its groups, the workflows in
 * them (with the org's settings applied), and each workflow's recent runs.
 * One store for the nav, the list page and the admin page.
 */

import { defineStore } from 'pinia';
import { computed, readonly, ref } from 'vue';
import type {
  WorkflowCatalogEntry,
  WorkflowCatalogView,
  WorkflowLifecycle,
} from '@orchestrator-ai/transport-types';
import {
  workflowsApiService,
  type WorkflowRunNavItem,
} from '@/modules/workflows/services/workflows-api.service';
import { workflowRouteName } from '@/modules/workflows/workflowUiRegistry';

export type LifecycleFilter = WorkflowLifecycle | 'all';

export interface NavGroup {
  key: string;
  name: string;
  workflows: WorkflowCatalogEntry[];
}

/** Badge text for a lifecycle; production workflows carry none. */
export function lifecycleBadge(lifecycle: WorkflowLifecycle): string | null {
  switch (lifecycle) {
    case 'newly_created':
      return 'New';
    case 'dev':
      return 'Dev';
    case 'test':
      return 'Test';
    case 'prod':
      return null;
  }
}

export const useWorkflowCatalogStore = defineStore('workflow-catalog', () => {
  const catalog = ref<WorkflowCatalogView>({ workflows: [], groups: [] });
  const runsBySlug = ref<Record<string, WorkflowRunNavItem[]>>({});
  const loading = ref(false);
  const error = ref<string | null>(null);
  /** The org the catalog was loaded for ("*" = all organizations). */
  const loadedOrg = ref<string | null>(null);
  const lifecycleFilter = ref<LifecycleFilter>('all');
  /** Admins also see workflows the org has disabled, marked as such. */
  const showDisabled = ref(false);

  const bySlug = computed(
    () => new Map(catalog.value.workflows.map((workflow) => [workflow.slug, workflow])),
  );

  /** Groups in nav order, filtered, without empty groups. */
  const navGroups = computed<NavGroup[]>(() =>
    catalog.value.groups
      .map((group) => ({
        key: group.id ?? `default:${group.name}`,
        name: group.name,
        workflows: group.workflowSlugs
          .map((slug) => bySlug.value.get(slug))
          .filter((workflow): workflow is WorkflowCatalogEntry => workflow !== undefined)
          .filter((workflow) => workflow.enabled || showDisabled.value)
          .filter(
            (workflow) =>
              lifecycleFilter.value === 'all' || workflow.lifecycle === lifecycleFilter.value,
          ),
      }))
      .filter((group) => group.workflows.length > 0),
  );

  function workflow(slug: string): WorkflowCatalogEntry | undefined {
    return bySlug.value.get(slug);
  }

  function runsFor(slug: string): WorkflowRunNavItem[] {
    return runsBySlug.value[slug] ?? [];
  }

  /**
   * Load the org's catalog, then the recent runs of every enabled workflow
   * that has a page here.
   */
  async function load(orgSlug: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const header = orgSlug === '*' ? undefined : orgSlug;
      const view = await workflowsApiService.fetchCatalog(header);
      const withRuns = view.workflows.filter(
        (entry) => entry.enabled && workflowRouteName(entry.slug) !== null,
      );
      const runs = await Promise.all(
        withRuns.map(
          async (entry) =>
            [entry.slug, await workflowsApiService.fetchWorkflowRuns(entry.slug, header)] as const,
        ),
      );
      catalog.value = view;
      runsBySlug.value = Object.fromEntries(runs);
      loadedOrg.value = orgSlug;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function refreshRuns(slug: string): Promise<void> {
    const header = loadedOrg.value === '*' || loadedOrg.value === null ? undefined : loadedOrg.value;
    runsBySlug.value = {
      ...runsBySlug.value,
      [slug]: await workflowsApiService.fetchWorkflowRuns(slug, header),
    };
  }

  function removeRun(slug: string, conversationId: string): void {
    runsBySlug.value = {
      ...runsBySlug.value,
      [slug]: runsFor(slug).filter((run) => run.conversationId !== conversationId),
    };
  }

  function setLifecycleFilter(filter: LifecycleFilter): void {
    lifecycleFilter.value = filter;
  }

  function setShowDisabled(value: boolean): void {
    showDisabled.value = value;
  }

  function clear(): void {
    catalog.value = { workflows: [], groups: [] };
    runsBySlug.value = {};
    loadedOrg.value = null;
    error.value = null;
  }

  return {
    catalog: readonly(catalog),
    loading: readonly(loading),
    error: readonly(error),
    loadedOrg: readonly(loadedOrg),
    lifecycleFilter: readonly(lifecycleFilter),
    showDisabled: readonly(showDisabled),
    navGroups,
    workflow,
    runsFor,
    load,
    refreshRuns,
    removeRun,
    setLifecycleFilter,
    setShowDisabled,
    clear,
  };
});
