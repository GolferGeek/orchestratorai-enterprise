import { SupabaseService } from '@orchestratorai/planes/database';
import { DatabaseService } from '@orchestratorai/planes/database';
import { DatabaseProvider } from './database-provider.interface';
import { SqlServerDatabaseProviderService } from './sqlserver-database-provider.service';
import { SupabaseDatabaseProviderService } from './supabase-database-provider.service';

type ContractHarness = {
  provider: DatabaseProvider;
  setIdentityLookupResult: (userId: string | null) => void;
  setCreateShadowTaskResult: (id: string, title: string) => void;
  reset: () => void;
};

function createSqlServerHarness(): ContractHarness {
  const rawQueryMock = jest.fn();

  const db = {
    rawQuery: rawQueryMock,
    from: jest.fn(),
    rpc: jest.fn(),
    checkConnection: jest.fn(),
    getConfig: jest.fn(),
    getCheckpointSaver: jest.fn(),
  } as unknown as DatabaseService;

  return {
    provider: new SqlServerDatabaseProviderService(db),
    setIdentityLookupResult: (userId) => {
      rawQueryMock.mockResolvedValueOnce({
        data: userId ? [{ user_id: userId }] : [],
        error: null,
      });
    },
    setCreateShadowTaskResult: (id, title) => {
      rawQueryMock.mockResolvedValueOnce({
        data: [{ id, title }],
        error: null,
      });
    },
    reset: () => {
      jest.clearAllMocks();
    },
  };
}

function createSupabaseHarness(): ContractHarness {
  const maybeSingle = jest.fn();
  const eqSubject = jest.fn(() => ({ maybeSingle }));
  const eqIssuer = jest.fn(() => ({ eq: eqSubject }));
  const selectIdentity = jest.fn(() => ({ eq: eqIssuer }));

  const single = jest.fn();
  const selectInsert = jest.fn(() => ({ single }));
  const insert = jest.fn(() => ({ select: selectInsert }));
  const fromSchema = jest.fn((table: string) => {
    if (table === 'auth_identity_links') {
      return { select: selectIdentity, upsert: jest.fn() };
    }
    return { insert };
  });
  const schema = jest.fn(() => ({ from: fromSchema }));

  const client = {
    from: jest.fn(() => ({ select: selectIdentity })),
    schema,
  };

  const supabaseService = {
    getServiceClient: jest.fn(() => client),
  } as unknown as SupabaseService;

  return {
    provider: new SupabaseDatabaseProviderService(supabaseService),
    setIdentityLookupResult: (userId) => {
      maybeSingle.mockResolvedValueOnce({
        data: userId ? { user_id: userId } : null,
        error: null,
      });
    },
    setCreateShadowTaskResult: (id, title) => {
      single.mockResolvedValueOnce({
        data: { id, title },
        error: null,
      });
    },
    reset: () => {
      jest.clearAllMocks();
    },
  };
}

describe.each([
  ['supabase', createSupabaseHarness],
  ['sqlserver', createSqlServerHarness],
])('DatabaseProvider contract parity (%s)', (_name, makeHarness) => {
  let harness: ContractHarness;

  beforeEach(() => {
    harness = makeHarness();
  });

  afterEach(() => {
    harness.reset();
  });

  it('findIdentityLinkUserId returns mapped user id when found', async () => {
    harness.setIdentityLookupResult('user-123');

    const userId = await harness.provider.findIdentityLinkUserId({
      issuer: 'issuer',
      subject: 'subject',
    });

    expect(userId).toBe('user-123');
  });

  it('findIdentityLinkUserId returns null when missing', async () => {
    harness.setIdentityLookupResult(null);

    const userId = await harness.provider.findIdentityLinkUserId({
      issuer: 'issuer',
      subject: 'subject',
    });

    expect(userId).toBeNull();
  });

  it('createAdoShadowTask returns created id/title', async () => {
    harness.setCreateShadowTaskResult('internal-1', 'Task title');

    const created = await harness.provider.createAdoShadowTask({
      title: 'Task title',
      description: 'desc',
      assignedTo: 'Claude',
      teamId: null,
      channelId: null,
      sourceChannelUserId: null,
      externalTaskId: '123',
    });

    expect(created).toEqual({
      id: 'internal-1',
      title: 'Task title',
    });
  });
});
