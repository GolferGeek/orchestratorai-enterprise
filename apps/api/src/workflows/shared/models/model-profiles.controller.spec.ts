import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WorkflowRegistry } from '../../catalog/workflow.registry';
import { ModelProfilesController } from './model-profiles.controller';
import { UnknownModelError, type ModelProfilesRepository } from './model-profiles.repository';

function setup() {
  const registry = new WorkflowRegistry();
  registry.register({
    slug: 'exec-digest',
    name: 'Executive Digest',
    organizationSlugs: ['finance'],
    entryPoint: {
      kind: 'runtime',
      maxAttempts: 1,
      modelRoles: ['drafter', 'critic'],
      accessControl: { mode: 'org' },
      parseStartInput: (input) => input,
      runTitle: () => 'digest',
    },
  });
  registry.register({
    slug: 'marketing-swarm',
    name: 'Marketing Swarm',
    organizationSlugs: ['finance'],
    entryPoint: { kind: 'custom', invoke: jest.fn(), runs: null },
  });
  const profiles = {
    list: jest.fn(async () => []),
    upsert: jest.fn(async (p: Record<string, string>) => ({ id: 'p1', ...p })),
    delete: jest.fn(async () => true),
  };
  const controller = new ModelProfilesController(
    profiles as unknown as ModelProfilesRepository,
    registry,
  );
  return { controller, profiles };
}

const save = { workflowSlug: 'exec-digest', role: 'drafter', provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' };

describe('ModelProfilesController', () => {
  it('saves a profile for a declared role in the bound org, recording who', async () => {
    const { controller, profiles } = setup();
    await controller.save(save, { id: 'admin-1' }, { organizationSlug: 'finance' });
    expect(profiles.upsert).toHaveBeenCalledWith({ ...save, organizationSlug: 'finance', updatedBy: 'admin-1' });
  });

  it.each([
    ['a missing field', { ...save, model: ' ' }, 'required'],
    ['a workflow without model roles', { ...save, workflowSlug: 'marketing-swarm' }, 'does not use model profiles'],
    ['an undeclared role', { ...save, role: 'judge' }, 'has no role "judge"'],
  ])('refuses %s', async (_label, body, message) => {
    const { controller, profiles } = setup();
    await expect(controller.save(body, { id: 'a' }, { organizationSlug: 'finance' })).rejects.toThrow(message);
    expect(profiles.upsert).not.toHaveBeenCalled();
  });

  it('reports an unknown model as a bad request', async () => {
    const { controller, profiles } = setup();
    profiles.upsert.mockRejectedValueOnce(new UnknownModelError('openrouter', 'x'));
    await expect(controller.save(save, { id: 'a' }, { organizationSlug: 'finance' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('requires a selected org and 404s a profile of another org', async () => {
    const { controller, profiles } = setup();
    await expect(controller.list(undefined, { organizationSlug: '*' })).rejects.toThrow('Select an organization');
    profiles.delete.mockResolvedValueOnce(false);
    await expect(controller.remove('p1', { organizationSlug: 'finance' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
