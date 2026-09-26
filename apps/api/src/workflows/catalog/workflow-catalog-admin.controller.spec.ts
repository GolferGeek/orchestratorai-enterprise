import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WorkflowCatalogAdminController } from './workflow-catalog-admin.controller';
import { CatalogChangeError, type WorkflowCatalogRepository } from './workflow-catalog.repository';
import type { WorkflowCatalogService } from './workflow-catalog.service';
import { WorkflowRegistry } from './workflow.registry';

function setup() {
  const registry = new WorkflowRegistry();
  for (const slug of ['exec-digest', 'board-pack']) {
    registry.register({
      slug,
      name: slug,
      organizationSlugs: ['corporate'],
      icon: 'flow',
      defaultGroup: 'Reporting',
      defaultLifecycle: 'dev',
      hitl: false,
      dataClassification: 'internal',
      entryPoint: { kind: 'rest', endpoint: '/x' },
    });
  }
  const catalog = {
    view: jest.fn(async () => ({
      workflows: [{ slug: 'exec-digest', enabled: true, lifecycle: 'dev', note: 'Old note' }],
      groups: [],
    })),
  };
  const repo = {
    saveSetting: jest.fn(async () => undefined),
    createGroup: jest.fn(async () => ({ id: 'g1', name: 'Board', position: 0, workflowSlugs: [] })),
    renameGroup: jest.fn(async () => true),
    deleteGroup: jest.fn(async () => true),
    replaceLayout: jest.fn(async () => undefined),
    groups: jest.fn(async () => []),
  };
  const controller = new WorkflowCatalogAdminController(
    registry,
    catalog as unknown as WorkflowCatalogService,
    repo as unknown as WorkflowCatalogRepository,
  );
  return { controller, repo };
}

const admin = { id: 'admin-1' };
const req = { organizationSlug: 'corporate' };

describe('WorkflowCatalogAdminController', () => {
  it('patches only the given settings, keeping the rest', async () => {
    const { controller, repo } = setup();
    await expect(controller.saveSetting('exec-digest', { lifecycle: 'prod' }, admin, req)).resolves.toEqual({
      workflowSlug: 'exec-digest',
      enabled: true,
      lifecycle: 'prod',
      note: 'Old note',
    });
    await controller.saveSetting('exec-digest', { note: null }, admin, req);
    expect(repo.saveSetting).toHaveBeenLastCalledWith(
      'corporate',
      expect.objectContaining({ note: null }),
      'admin-1',
    );
  });

  it.each([
    [{ enabled: 'yes' }, 'enabled'],
    [{ lifecycle: 'beta' }, 'lifecycle'],
    [{ note: '  ' }, 'note'],
  ])('refuses setting %j', async (body, message) => {
    const { controller, repo } = setup();
    await expect(controller.saveSetting('exec-digest', body, admin, req)).rejects.toThrow(message);
    expect(repo.saveSetting).not.toHaveBeenCalled();
  });

  it("404s a workflow outside the org's catalog and requires a selected org", async () => {
    const { controller } = setup();
    await expect(controller.saveSetting('other', {}, admin, req)).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.groups({ organizationSlug: '*' })).rejects.toThrow('Select an organization');
  });

  it('checks a layout completely before saving it', async () => {
    const { controller, repo } = setup();
    await expect(
      controller.replaceLayout({ groups: [{ groupId: 'g1', workflowSlugs: ['exec-digest', 'nope'] }] }, req),
    ).rejects.toThrow('"nope" is not a workflow');
    await expect(
      controller.replaceLayout(
        { groups: [{ groupId: 'g1', workflowSlugs: ['exec-digest'] }, { groupId: 'g2', workflowSlugs: ['exec-digest'] }] },
        req,
      ),
    ).rejects.toThrow('placed twice');
    expect(repo.replaceLayout).not.toHaveBeenCalled();
    await controller.replaceLayout({ groups: [{ groupId: 'g1', workflowSlugs: ['board-pack', 'exec-digest'] }] }, req);
    expect(repo.replaceLayout).toHaveBeenCalledWith('corporate', [
      { groupId: 'g1', workflowSlugs: ['board-pack', 'exec-digest'] },
    ]);
  });

  it('reports a duplicate group name as a bad request', async () => {
    const { controller, repo } = setup();
    repo.createGroup.mockRejectedValueOnce(new CatalogChangeError('A group named "Board" already exists'));
    await expect(controller.createGroup({ name: 'Board' }, req)).rejects.toBeInstanceOf(BadRequestException);
  });
});
