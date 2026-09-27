import { isCapabilityCard, WORKFLOW_INVOKE_ACTIONS } from '@orchestrator-ai/transport-types';
import { WorkflowCardsController } from './workflow-cards.controller';
import { WorkflowRegistry, type CatalogWorkflow } from './workflow.registry';

const runtime = (slug: string, orgs: string[]): CatalogWorkflow => ({
  slug,
  name: slug,
  description: `${slug} does things`,
  organizationSlugs: orgs,
  icon: 'x',
  defaultGroup: 'G',
  defaultLifecycle: 'dev',
  hitl: true,
  dataClassification: 'internal',
  entryPoint: { kind: 'runtime', maxAttempts: 1, modelRoles: ['writer'], accessControl: { mode: 'org' }, parseStartInput: (i) => i, runTitle: () => 't', restartPoints: { draft: { resumeAt: 'review' } } },
});

describe('workflow cards', () => {
  const registry = new WorkflowRegistry();
  registry.register(runtime('onboarding-plan', ['human-resources']));
  registry.register(runtime('exec-digest', ['corporate']));
  registry.register(runtime('paused-thing', ['human-resources']));
  const catalog = {
    view: jest.fn(async (org: string) => ({
      workflows: registry.list(org).map((w) => ({ slug: w.slug, enabled: w.slug !== 'paused-thing' })),
      groups: [],
    })),
  };
  const controller = new WorkflowCardsController(registry, catalog as never);

  it("builds a valid card that says how to invoke the workflow", () => {
    const card = controller.card('onboarding-plan');
    expect(isCapabilityCard(card)).toBe(true);
    expect(card).toMatchObject({
      id: 'workflow:onboarding-plan',
      kind: 'workflow',
      invoke: { method: 'invoke', streaming: true },
      metadata: {
        endpoint: '/workflows/invoke',
        context: { agentSlug: 'onboarding-plan', agentType: 'workflow' },
        hitl: true,
        actions: [...WORKFLOW_INVOKE_ACTIONS],
        restartPoints: ['draft'],
        brief: '/workflows/onboarding-plan/brief',
      },
    });
  });

  it('404s an unknown workflow', () => {
    expect(() => controller.card('nope')).toThrow('No workflow nope');
  });

  it("lists only the org's enabled workflows", async () => {
    const listing = await controller.listing({ organizationSlug: 'human-resources' });
    expect(listing.capabilities.map((c) => c.slug)).toEqual(['onboarding-plan']);
    await expect(controller.listing({})).rejects.toThrow('Select an organization');
  });
});
