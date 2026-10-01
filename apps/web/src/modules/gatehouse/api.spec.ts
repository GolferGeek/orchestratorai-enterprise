import { beforeEach, describe, expect, it, vi } from 'vitest';

const rbac = { currentOrganization: 'finance' as string | null, initialize: vi.fn(async () => undefined) };
vi.mock('@/stores/rbacStore', () => ({ useRbacStore: () => rbac }));
vi.mock('@/services/tokenStorageService', () => ({ tokenStorage: { getAccessToken: vi.fn(async () => 'tok') } }));
vi.mock('@/shared/services/organization-context', () => ({ resolveConcreteOrganization: vi.fn(async () => 'finance') }));

import { GatehouseApiError, gatehouseApi } from './api';

const fetchMock = vi.fn();

describe('gatehouseApi', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    rbac.currentOrganization = 'finance';
  });

  it('sends the current org, and every org for callers', async () => {
    fetchMock.mockImplementation(async () => new Response('[]', { status: 200 }));
    await gatehouseApi.tasks({ agent: 'send-invoice', state: '' });
    await gatehouseApi.callers();
    const [[tasksUrl, tasksInit], [, callersInit]] = fetchMock.mock.calls as [string, RequestInit][];
    expect(tasksUrl).toBe('/api/gatehouse/tasks?agent=send-invoice');
    expect(tasksInit.headers).toMatchObject({ Authorization: 'Bearer tok', 'x-organization-slug': 'finance' });
    expect(callersInit.headers).toMatchObject({ 'x-organization-slug': '*' });
  });

  it('throws the message the API gave, with its status', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ statusCode: 409, message: 'suspend it instead' }), { status: 409 }));
    const error = await gatehouseApi.deleteCaller('c1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GatehouseApiError);
    expect(error).toMatchObject({ status: 409, message: 'suspend it instead' });
  });

  it('takes 204 for a removed watch, and refuses an empty answer where data is due', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(gatehouseApi.deleteWatch('w1')).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));
    await expect(gatehouseApi.agents()).rejects.toThrow('answered with no body');
  });
});
