import type { WorkflowAdminField } from '@orchestrator-ai/transport-types';
import { WorkflowRegistry } from '../../../catalog/workflow.registry';
import { WorkflowAdminController } from '../workflow-admin.controller';
import { AdminRowError, validateRow, type WorkflowAdminSection } from '../workflow-admin-section';
import { WorkflowAdminRegistry } from '../workflow-admin.registry';

const fields: WorkflowAdminField[] = [
  { key: 'id', label: 'Id', kind: 'text', required: true, readOnly: true },
  { key: 'name', label: 'Name', kind: 'text', required: true, maxLength: 10 },
  { key: 'weight', label: 'Weight', kind: 'number', required: true, min: 0, max: 1 },
  { key: 'active', label: 'Active', kind: 'boolean', required: true },
  { key: 'tier', label: 'Tier', kind: 'select', required: false, options: [{ value: 'a', label: 'A' }] },
  { key: 'url', label: 'URL', kind: 'url', required: false },
  { key: 'notes', label: 'Notes', kind: 'textarea', required: false },
];

describe('admin rows', () => {
  it('keeps checked values, trims text, drops read-only fields and nulls empty optionals', () => {
    expect(validateRow(fields, { id: 'x', name: ' Legal ', weight: 0.5, active: false, tier: 'a', url: 'https://a.io', notes: '' })).toEqual({
      name: 'Legal', weight: 0.5, active: false, tier: 'a', url: 'https://a.io', notes: null,
    });
  });

  it('refuses unknown, missing, out-of-range and mistyped values', () => {
    const ok = { name: 'n', weight: 0.5, active: true };
    expect(() => validateRow(fields, { ...ok, salary: 1 })).toThrow(/Unknown fields: salary/);
    expect(() => validateRow(fields, { ...ok, name: ' ' })).toThrow(/Name is required/);
    expect(() => validateRow(fields, { name: 'n', weight: 0.5 })).toThrow(/Active is required/);
    expect(() => validateRow(fields, { ...ok, weight: 2 })).toThrow(/at most 1/);
    expect(() => validateRow(fields, { ...ok, weight: '0.5' })).toThrow(/must be a number/);
    expect(() => validateRow(fields, { ...ok, name: 'x'.repeat(11) })).toThrow(/at most 10 characters/);
    expect(() => validateRow(fields, { ...ok, tier: 'b' })).toThrow(/one of a/);
    expect(() => validateRow(fields, { ...ok, url: 'ftp://a' })).toThrow(/http\(s\) URL/);
    expect(() => validateRow(fields, { ...ok, url: 'not a url' })).toThrow(AdminRowError);
    expect(() => validateRow(fields, [])).toThrow(/must be an object/);
  });
});

describe('admin registry', () => {
  const section = (key: string, over: Partial<WorkflowAdminSection> = {}): WorkflowAdminSection => ({
    key, label: key, description: '', kind: 'list', idField: 'id', titleField: 'name', fields, list: async () => [], ...over,
  });

  it('refuses repeated registration, repeated keys and id/title fields that are not fields', () => {
    const registry = new WorkflowAdminRegistry();
    registry.register('w', [section('a')]);
    expect(() => registry.register('w', [section('b')])).toThrow(/already registered/);
    expect(() => registry.register('x', [section('a'), section('a')])).toThrow(/repeat a key/);
    expect(() => registry.register('y', [section('a', { titleField: 'nope' })])).toThrow(/must be fields/);
    expect(() => registry.register('z', [section('a', { bulk: { label: 'W', fields: ['id'], save: async () => [] } })])).toThrow(/bulk fields must be editable/);
    expect(registry.section('w', 'a')?.key).toBe('a');
    expect(registry.sections('none')).toEqual([]);
  });
});

describe('admin controller', () => {
  const registry = new WorkflowRegistry();
  registry.register({
    slug: 'w', name: 'W', organizationSlugs: ['finance'], icon: 'x', defaultGroup: 'G', defaultLifecycle: 'dev', hitl: false, dataClassification: 'internal',
    entryPoint: { kind: 'runtime', maxAttempts: 1, modelRoles: ['writer'], accessControl: { mode: 'org' }, parseStartInput: (i) => i, runTitle: () => 't', restartPoints: {} },
  });
  const created: unknown[] = [];
  const updated: unknown[] = [];
  const bulkSaved: unknown[] = [];
  const admin = new WorkflowAdminRegistry();
  admin.register('w', [
    {
      key: 'items', label: 'Items', description: 'd', kind: 'list', idField: 'id', titleField: 'name', fields,
      list: async (org) => [{ id: '1', name: org }],
      create: async (_org, row) => { created.push(row); return { id: '2', ...row }; },
    },
    {
      key: 'weighted', label: 'Weighted', description: 'd', kind: 'list', idField: 'id', titleField: 'name', fields,
      list: async () => [],
      update: async (_org, id, row) => { updated.push(row); return { id, ...row }; },
      bulk: { label: 'Weights', fields: ['weight'], save: async (_org, rows) => { bulkSaved.push(rows); return []; } },
    },
  ]);
  const agents = {
    forWorkflow: jest.fn(async () => [{ slug: 'writer-agent' }]),
    save: jest.fn(async () => undefined),
    history: jest.fn(async () => []),
  };
  const controller = new WorkflowAdminController(registry, admin, agents as never);
  const finance = { organizationSlug: 'finance' };
  const user = { id: 'u' };

  it('shows the workflow with its roles, agents and sections, only in its org', async () => {
    const view = await controller.view('w', finance);
    expect(view.modelRoles).toEqual(['writer', 'reviewer']);
    expect(view.sections[0]).toMatchObject({ key: 'items', canCreate: true, canUpdate: false, canDelete: false });
    await expect(controller.view('w', { organizationSlug: 'legal' })).rejects.toThrow(/not available/);
    await expect(controller.view('w', { organizationSlug: '*' })).rejects.toThrow(/Select an organization/);
  });

  it('validates rows before the section sees them and refuses operations it does not offer', async () => {
    await expect(controller.create('w', 'items', { row: { name: 'n', weight: 5, active: true } }, user, finance)).rejects.toThrow(/at most 1/);
    expect(created).toEqual([]);
    await controller.create('w', 'items', { row: { name: 'n', weight: 1, active: true } }, user, finance);
    expect(created).toHaveLength(1);
    await expect(controller.update('w', 'items', '1', { row: {} }, user, finance)).rejects.toThrow(/cannot be changed/);
    await expect(controller.rows('w', 'nope', finance)).rejects.toThrow(/no admin section/);
  });

  it('saves bulk fields only together, and leaves them out of a row update', async () => {
    await controller.update('w', 'weighted', '1', { row: { id: '1', name: 'n', weight: 0.9, active: true } }, user, finance);
    expect(updated).toEqual([{ name: 'n', active: true, tier: null, url: null, notes: null }]);
    await controller.saveAll('w', 'weighted', { rows: [{ id: '1', row: { weight: 0.4 } }, { id: '2', row: { weight: 0.6 } }] }, user, finance);
    expect(bulkSaved).toEqual([[{ id: '1', row: { weight: 0.4 } }, { id: '2', row: { weight: 0.6 } }]]);
    await expect(controller.saveAll('w', 'weighted', { rows: [{ id: '1', row: { weight: 0.4, name: 'x' } }] }, user, finance)).rejects.toThrow(/Unknown fields: name/);
    await expect(controller.saveAll('w', 'weighted', { rows: [{ id: '1', row: { weight: 1 } }, { id: '1', row: { weight: 1 } }] }, user, finance)).rejects.toThrow(/listed twice/);
    await expect(controller.saveAll('w', 'items', { rows: [{ id: '1', row: {} }] }, user, finance)).rejects.toThrow(/no bulk edit/);
  });

  it("saves an agent's instructions only for an agent the workflow runs", async () => {
    await controller.saveAgent('w', 'writer-agent', { instructions: ' Be brief. ' }, user, finance);
    expect(agents.save).toHaveBeenCalledWith('writer-agent', 'finance', 'Be brief.', 'u');
    await controller.saveAgent('w', 'writer-agent', { instructions: null }, user, finance);
    expect(agents.save).toHaveBeenLastCalledWith('writer-agent', 'finance', null, 'u');
    await expect(controller.saveAgent('w', 'other', { instructions: 'x' }, user, finance)).rejects.toThrow(/does not run agent/);
    await expect(controller.saveAgent('w', 'writer-agent', { instructions: '  ' }, user, finance)).rejects.toThrow(/non-empty/);
  });
});
