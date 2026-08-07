import {
  WorkflowDefinition,
  WorkflowRegistryService,
} from './workflow-registry.service';

function workflow(orgSlug: string, id = 'workflow-1'): WorkflowDefinition {
  return {
    id,
    orgSlug,
    name: `${orgSlug} workflow`,
    description: 'test',
    trigger: 'manual',
    steps: [],
    enabled: true,
  };
}

describe('WorkflowRegistryService tenant isolation', () => {
  it('allows the same workflow id in separate organizations', () => {
    const registry = new WorkflowRegistryService();
    registry.register(workflow('org-a'));
    registry.register(workflow('org-b'));

    expect(registry.getAll('org-a')).toEqual([
      expect.objectContaining({ orgSlug: 'org-a' }),
    ]);
    expect(registry.getAll('org-b')).toEqual([
      expect.objectContaining({ orgSlug: 'org-b' }),
    ]);
  });

  it('scopes enable, disable, and runs by organization', () => {
    const registry = new WorkflowRegistryService();
    registry.register(workflow('org-a'));
    registry.register(workflow('org-b'));
    registry.disable('workflow-1', 'org-a');

    expect(registry.getById('workflow-1', 'org-a')?.enabled).toBe(false);
    expect(registry.getById('workflow-1', 'org-b')?.enabled).toBe(true);

    registry.recordRun({
      id: 'run-a',
      orgSlug: 'org-a',
      workflowId: 'workflow-1',
      status: 'completed',
      triggeredBy: 'manual',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      outcome: {},
      error: null,
    });
    registry.recordRun({
      id: 'run-b',
      orgSlug: 'org-b',
      workflowId: 'workflow-1',
      status: 'completed',
      triggeredBy: 'manual',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      outcome: {},
      error: null,
    });

    expect(registry.getRuns(undefined, 'org-a')).toHaveLength(1);
    expect(registry.getRuns(undefined, 'org-a')[0]?.id).toBe('run-a');
  });
});
