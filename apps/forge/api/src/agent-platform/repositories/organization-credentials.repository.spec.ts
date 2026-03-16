import { OrganizationCredentialsRepository } from './organization-credentials.repository';
import { DatabaseService } from '@/database';

const createDbMock = () => {
  const fromMock = jest.fn();
  const db = { from: fromMock } as unknown as DatabaseService;
  return { fromMock, db };
};

describe('OrganizationCredentialsRepository', () => {
  afterEach(() => jest.resetAllMocks());

  const credential = {
    id: 'cred-1',
    organization_slug: 'my-org',
    alias: 'supabase_service_key',
    credential_type: 'supabase_service_key',
    encrypted_value: 'cipher',
    encryption_metadata: { nonce: 'abc' },
    rotated_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it('upserts credentials', async () => {
    const { fromMock, db } = createDbMock();
    const maybeSingle = jest
      .fn()
      .mockResolvedValue({ data: credential, error: null });
    const select = jest.fn().mockReturnValue({ maybeSingle });
    const upsert = jest.fn().mockReturnValue({ select });
    fromMock.mockReturnValue({ upsert });

    const repo = new OrganizationCredentialsRepository(db);
    const result = await repo.upsert({
      organization_slug: credential.organization_slug,
      alias: credential.alias,
      credential_type: credential.credential_type,
      encrypted_value: credential.encrypted_value,
      encryption_metadata: credential.encryption_metadata,
    });

    expect(fromMock).toHaveBeenCalledWith(null, 'organization_credentials');
    expect(upsert).toHaveBeenCalled();
    expect(result).toEqual(credential);
  });

  it('retrieves credential by alias', async () => {
    const { fromMock, db } = createDbMock();
    const maybeSingle = jest
      .fn()
      .mockResolvedValue({ data: credential, error: null });
    const eq = jest.fn().mockReturnThis();
    eq.mockReturnValueOnce({ eq: jest.fn().mockReturnValue({ maybeSingle }) });
    const select = jest.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ select });

    const repo = new OrganizationCredentialsRepository(db);
    const result = await repo.get('my-org', 'supabase_service_key');

    expect(select).toHaveBeenCalledWith('*');
    expect(eq).toHaveBeenCalledWith('organization_slug', 'my-org');
    expect(result).toEqual(credential);
  });

  it('lists credentials for an organization', async () => {
    const { fromMock, db } = createDbMock();
    const order = jest
      .fn()
      .mockResolvedValue({ data: [credential], error: null });
    const eq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ select });

    const repo = new OrganizationCredentialsRepository(db);
    const result = await repo.listByOrganization('my-org');

    expect(eq).toHaveBeenCalledWith('organization_slug', 'my-org');
    expect(result).toEqual([credential]);
  });

  it('deletes credential', async () => {
    const { fromMock, db } = createDbMock();
    const eqAlias = jest.fn().mockResolvedValue({ error: null });
    const eqOrg = jest.fn().mockReturnValue({ eq: eqAlias });
    const deleteFn = jest.fn().mockReturnValue({ eq: eqOrg });
    fromMock.mockReturnValue({ delete: deleteFn });

    const repo = new OrganizationCredentialsRepository(db);
    await repo.delete('my-org', 'supabase_service_key');

    expect(deleteFn).toHaveBeenCalled();
    expect(eqOrg).toHaveBeenCalledWith('organization_slug', 'my-org');
    expect(eqAlias).toHaveBeenCalledWith('alias', 'supabase_service_key');
  });
});
