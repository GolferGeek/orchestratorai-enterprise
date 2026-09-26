import { WorkflowRegistry, type CatalogWorkflow } from './workflow.registry';

const rest = { kind: 'rest', endpoint: '/workflows/x' } as const;

/**
 * The registry exists so that adding a workflow is writing a graph and calling
 * `register` — no row in the `agents` table, no hardcoded slug constant, no
 * controller edit. These tests pin that boundary.
 */
describe('WorkflowRegistry', () => {
  let registry: WorkflowRegistry;

  beforeEach(() => {
    registry = new WorkflowRegistry();
  });

  const swarm: CatalogWorkflow = {
    slug: 'marketing-swarm',
    name: 'Marketing Swarm',
    organizationSlugs: ['marketing'],
    icon: 'flow', defaultGroup: 'General', defaultLifecycle: 'dev', hitl: false, dataClassification: 'internal',
    entryPoint: rest,
  };
  const everywhere: CatalogWorkflow = {
    slug: 'meeting-notes',
    name: 'Meeting Notes',
    organizationSlugs: ['global'],
    icon: 'flow', defaultGroup: 'General', defaultLifecycle: 'dev', hitl: false, dataClassification: 'internal',
    entryPoint: rest,
  };

  it('lists what has registered, with no database involved', () => {
    registry.register(swarm);

    expect(registry.list('marketing')).toEqual([
      expect.objectContaining({ slug: 'marketing-swarm' }),
    ]);
  });

  it('scopes to an organization', () => {
    registry.register(swarm);

    expect(registry.list('legal')).toEqual([]);
    expect(registry.has('marketing-swarm', 'legal')).toBe(false);
  });

  it('treats global as every organization', () => {
    registry.register(everywhere);

    expect(registry.has('meeting-notes', 'legal')).toBe(true);
    expect(registry.has('meeting-notes', 'finance')).toBe(true);
  });

  it('returns everything for the all-organizations scope', () => {
    registry.register(swarm);
    registry.register(everywhere);

    // Matches how agent listing treats '*'.
    expect(registry.list('*')).toHaveLength(2);
    expect(registry.list()).toHaveLength(2);
  });

  it('refuses two graphs claiming one slug', () => {
    registry.register(swarm);

    // Silently keeping the last registration would mean the catalog shows one
    // workflow while a different graph runs.
    expect(() =>
      registry.register({ ...swarm, name: 'Something Else' }),
    ).toThrow(/already registered/);
  });

  it('reports an unregistered slug as absent rather than throwing', () => {
    expect(registry.get('never-registered')).toBeUndefined();
    expect(registry.has('never-registered')).toBe(false);
  });

  it('adding a workflow needs nothing but a register call', () => {
    // The whole point: no row, no constant, no controller change.
    expect(registry.list('legal')).toEqual([]);

    registry.register({
      slug: 'contract-review',
      name: 'Contract Review',
      description: 'Clause extraction, risk flags and a summary.',
      organizationSlugs: ['legal'],
      icon: 'flow', defaultGroup: 'General', defaultLifecycle: 'dev', hitl: false, dataClassification: 'internal',
      entryPoint: rest,
    });

    expect(registry.list('legal')).toEqual([
      expect.objectContaining({ slug: 'contract-review' }),
    ]);
  });
});
