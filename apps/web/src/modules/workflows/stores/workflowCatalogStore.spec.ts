import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { WorkflowCatalogEntry, WorkflowCatalogView } from '@orchestrator-ai/transport-types';

const fetchCatalog = vi.fn();
const fetchWorkflowRuns = vi.fn();
vi.mock('@/modules/workflows/services/workflows-api.service', () => ({
  workflowsApiService: {
    fetchCatalog: (...args: unknown[]) => fetchCatalog(...args),
    fetchWorkflowRuns: (...args: unknown[]) => fetchWorkflowRuns(...args),
  },
}));

import { lifecycleBadge, useWorkflowCatalogStore } from './workflowCatalogStore';

function entry(slug: string, overrides: Partial<WorkflowCatalogEntry> = {}): WorkflowCatalogEntry {
  return {
    slug,
    name: slug,
    description: null,
    icon: 'flow',
    hitl: false,
    dataClassification: 'internal',
    lifecycle: 'prod',
    enabled: true,
    note: null,
    group: 'Content',
    contextModel: null,
    ...overrides,
  };
}

const view: WorkflowCatalogView = {
  workflows: [
    entry('marketing-swarm'),
    entry('decision-risk', { lifecycle: 'dev', group: 'Strategy' }),
    entry('paused-one', { enabled: false, group: 'Strategy' }),
  ],
  groups: [
    { id: 'g1', name: 'Content', position: 0, workflowSlugs: ['marketing-swarm'] },
    { id: null, name: 'Strategy', position: 1, workflowSlugs: ['decision-risk', 'paused-one'] },
  ],
};

describe('workflowCatalogStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    fetchCatalog.mockResolvedValue(view);
    fetchWorkflowRuns.mockResolvedValue([{ conversationId: 'c1', workflowSlug: 'marketing-swarm' }]);
  });

  it('loads the org catalog, and runs only for enabled workflows that have a page', async () => {
    const store = useWorkflowCatalogStore();
    await store.load('marketing');
    expect(fetchCatalog).toHaveBeenCalledWith('marketing');
    // decision-risk and marketing-swarm have pages; paused-one is disabled.
    expect(fetchWorkflowRuns.mock.calls).toEqual([
      ['marketing-swarm', 'marketing'],
      ['decision-risk', 'marketing'],
    ]);
    expect(store.runsFor('marketing-swarm')).toHaveLength(1);
    expect(store.loadedOrg).toBe('marketing');
  });

  it('sends no org header for all organizations', async () => {
    await useWorkflowCatalogStore().load('*');
    expect(fetchCatalog).toHaveBeenCalledWith(undefined);
  });

  it('groups in order, hiding disabled workflows unless asked, and filtering by lifecycle', async () => {
    const store = useWorkflowCatalogStore();
    await store.load('corporate');
    expect(store.navGroups.map((g) => [g.name, g.workflows.map((w) => w.slug)])).toEqual([
      ['Content', ['marketing-swarm']],
      ['Strategy', ['decision-risk']],
    ]);
    store.setShowDisabled(true);
    expect(store.navGroups[1]!.workflows.map((w) => w.slug)).toEqual(['decision-risk', 'paused-one']);
    store.setLifecycleFilter('dev');
    expect(store.navGroups.map((g) => g.name)).toEqual(['Strategy']);
  });

  it('keeps its previous catalog and reports the error when loading fails', async () => {
    const store = useWorkflowCatalogStore();
    await store.load('corporate');
    fetchCatalog.mockRejectedValueOnce(new Error('Workflows API request failed with status 500'));
    await expect(store.load('finance')).rejects.toThrow('status 500');
    expect(store.error).toBe('Workflows API request failed with status 500');
    expect(store.loadedOrg).toBe('corporate');
  });

  it('badges every lifecycle but production', () => {
    expect(['newly_created', 'dev', 'test', 'prod'].map((l) => lifecycleBadge(l as never))).toEqual([
      'New',
      'Dev',
      'Test',
      null,
    ]);
  });
});
