import type { WorkflowCatalogRepository } from './workflow-catalog.repository';
import { WorkflowCatalogService } from './workflow-catalog.service';
import { WorkflowRegistry, type CatalogWorkflow } from './workflow.registry';

function workflow(slug: string, defaultGroup: string, overrides: Partial<CatalogWorkflow> = {}): CatalogWorkflow {
  return {
    slug,
    name: slug,
    organizationSlugs: ['corporate'],
    icon: 'flow',
    defaultGroup,
    defaultLifecycle: 'dev',
    hitl: false,
    dataClassification: 'internal',
    entryPoint: { kind: 'rest', endpoint: '/x' },
    ...overrides,
  };
}

function setup(settings: unknown[] = [], groups: unknown[] = []) {
  const registry = new WorkflowRegistry();
  registry.register(workflow('decision-risk', 'Strategy'));
  registry.register(workflow('exec-digest', 'Reporting'));
  registry.register(workflow('board-pack', 'Reporting'));
  registry.register(workflow('legal-only', 'Legal', { organizationSlugs: ['legal'] }));
  const repo = {
    settings: jest.fn(async () => settings),
    groups: jest.fn(async () => groups),
    syncRegistry: jest.fn(async () => undefined),
  };
  return { service: new WorkflowCatalogService(registry, repo as unknown as WorkflowCatalogRepository), repo, registry };
}

describe('WorkflowCatalogService.view', () => {
  it('uses code defaults for an org with no settings or groups', async () => {
    const view = await setup().service.view('corporate');
    expect(view.workflows.map((w) => [w.slug, w.enabled, w.lifecycle, w.group])).toEqual([
      ['decision-risk', true, 'dev', 'Strategy'],
      ['exec-digest', true, 'dev', 'Reporting'],
      ['board-pack', true, 'dev', 'Reporting'],
    ]);
    expect(view.groups).toEqual([
      { id: null, name: 'Reporting', position: 0, workflowSlugs: ['exec-digest', 'board-pack'] },
      { id: null, name: 'Strategy', position: 1, workflowSlugs: ['decision-risk'] },
    ]);
  });

  it("applies the org's settings and puts its groups first, merging a default group of the same name", async () => {
    const { service } = setup(
      [{ workflowSlug: 'exec-digest', enabled: false, lifecycle: 'prod', note: 'Paused for Q4' }],
      [
        { id: 'g1', name: 'Board', position: 0, workflowSlugs: ['board-pack', 'legal-only'] },
        { id: 'g2', name: 'Strategy', position: 1, workflowSlugs: [] },
      ],
    );
    const view = await service.view('corporate');
    expect(view.workflows.find((w) => w.slug === 'exec-digest')).toMatchObject({
      enabled: false,
      lifecycle: 'prod',
      note: 'Paused for Q4',
      group: 'Reporting',
    });
    expect(view.workflows.find((w) => w.slug === 'board-pack')?.group).toBe('Board');
    expect(view.groups).toEqual([
      { id: 'g1', name: 'Board', position: 0, workflowSlugs: ['board-pack'] },
      { id: 'g2', name: 'Strategy', position: 1, workflowSlugs: ['decision-risk'] },
      { id: null, name: 'Reporting', position: 2, workflowSlugs: ['exec-digest'] },
    ]);
  });

  it('reads no org rows for the all-organizations scope', async () => {
    const { service, repo } = setup();
    const view = await service.view('*');
    expect(view.workflows).toHaveLength(4);
    expect(repo.settings).not.toHaveBeenCalled();
  });

  it('mirrors every registered workflow at boot', async () => {
    const { service, repo } = setup();
    await service.onApplicationBootstrap();
    expect(repo.syncRegistry).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ slug: 'legal-only' })]));
  });
});
