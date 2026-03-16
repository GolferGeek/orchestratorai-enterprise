import { SqlServerDatabaseProviderService } from './sqlserver-database-provider.service';
import { DatabaseService } from '@orchestratorai/planes/database';

function makeMockDb(rawQueryResult: {
  data: unknown;
  error: { message: string } | null;
}): DatabaseService {
  return {
    rawQuery: jest.fn().mockResolvedValue(rawQueryResult),
    from: jest.fn(),
    rpc: jest.fn(),
    checkConnection: jest.fn(),
    getConfig: jest.fn(),
    getCheckpointSaver: jest.fn(),
  } as unknown as DatabaseService;
}

describe('SqlServerDatabaseProviderService', () => {
  it('findIdentityLinkUserId returns mapped user id', async () => {
    const db = makeMockDb({ data: [{ user_id: 'user-1' }], error: null });
    const service = new SqlServerDatabaseProviderService(db);

    const userId = await service.findIdentityLinkUserId({
      issuer: 'issuer',
      subject: 'subject',
    });

    expect(userId).toBe('user-1');
    expect(db.rawQuery).toHaveBeenCalledWith(
      expect.stringContaining('user_id FROM authz.identity_links'),
      ['issuer', 'subject'],
    );
  });

  it('findIdentityLinkUserId returns null when no row found', async () => {
    const db = makeMockDb({ data: [], error: null });
    const service = new SqlServerDatabaseProviderService(db);

    const userId = await service.findIdentityLinkUserId({
      issuer: 'issuer',
      subject: 'subject',
    });

    expect(userId).toBeNull();
  });

  it('findIdentityLinkUserId throws when rawQuery returns an error', async () => {
    const db = makeMockDb({
      data: null,
      error: { message: 'connection refused' },
    });
    const service = new SqlServerDatabaseProviderService(db);

    await expect(
      service.findIdentityLinkUserId({ issuer: 'i', subject: 's' }),
    ).rejects.toThrow('Failed to resolve identity link: connection refused');
  });

  it('upsertIdentityLink succeeds without error', async () => {
    const db = makeMockDb({ data: null, error: null });
    const service = new SqlServerDatabaseProviderService(db);

    await expect(
      service.upsertIdentityLink({
        userId: 'u1',
        issuer: 'issuer',
        subject: 'subject',
        email: 'test@example.com',
        rawClaims: { sub: 'subject' },
      }),
    ).resolves.toBeUndefined();
    expect(db.rawQuery).toHaveBeenCalledWith(
      expect.stringContaining('authz.identity_links'),
      expect.any(Array),
    );
  });

  it('upsertIdentityLink throws when rawQuery returns an error', async () => {
    const db = makeMockDb({
      data: null,
      error: { message: 'constraint violation' },
    });
    const service = new SqlServerDatabaseProviderService(db);

    await expect(
      service.upsertIdentityLink({
        userId: 'u1',
        issuer: 'issuer',
        subject: 'subject',
        email: null,
        rawClaims: {},
      }),
    ).rejects.toThrow('Failed to upsert identity link: constraint violation');
  });

  it('createAdoShadowTask returns inserted row', async () => {
    const db = makeMockDb({
      data: [{ id: 'task-id', title: 'test task' }],
      error: null,
    });
    const service = new SqlServerDatabaseProviderService(db);

    const created = await service.createAdoShadowTask({
      title: 'test task',
      description: null,
      assignedTo: 'Claude',
      teamId: null,
      channelId: null,
      sourceChannelUserId: null,
      externalTaskId: '123',
    });

    expect(created).toEqual({ id: 'task-id', title: 'test task' });
    expect(db.rawQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO orch_flow.shared_tasks'),
      expect.any(Array),
    );
  });

  it('createAdoShadowTask throws when no row returned', async () => {
    const db = makeMockDb({ data: [], error: null });
    const service = new SqlServerDatabaseProviderService(db);

    await expect(
      service.createAdoShadowTask({
        title: 'test task',
        description: null,
        assignedTo: 'Claude',
        teamId: null,
        channelId: null,
        sourceChannelUserId: null,
        externalTaskId: '123',
      }),
    ).rejects.toThrow(
      'Failed to persist ADO task mapping: No task row returned',
    );
  });

  it('findAdoExternalTaskIdByInternalId returns external task id', async () => {
    const db = makeMockDb({
      data: [{ external_task_id: 'ADO-42' }],
      error: null,
    });
    const service = new SqlServerDatabaseProviderService(db);

    const externalId =
      await service.findAdoExternalTaskIdByInternalId('task-uuid');

    expect(externalId).toBe('ADO-42');
    expect(db.rawQuery).toHaveBeenCalledWith(
      expect.stringContaining(
        'external_task_id FROM orch_flow.shared_tasks',
      ),
      ['task-uuid', 'ado'],
    );
  });

  it('findAdoExternalTaskIdByInternalId returns null when not found', async () => {
    const db = makeMockDb({ data: [], error: null });
    const service = new SqlServerDatabaseProviderService(db);

    const externalId =
      await service.findAdoExternalTaskIdByInternalId('task-uuid');
    expect(externalId).toBeNull();
  });

  it('updateAdoShadowTaskStatus executes update query', async () => {
    const db = makeMockDb({ data: null, error: null });
    const service = new SqlServerDatabaseProviderService(db);

    await expect(
      service.updateAdoShadowTaskStatus('task-uuid', 'done'),
    ).resolves.toBeUndefined();
    expect(db.rawQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE orch_flow.shared_tasks'),
      ['done', true, 'task-uuid'],
    );
  });

  it('updateAdoShadowTaskStatus throws when rawQuery returns an error', async () => {
    const db = makeMockDb({ data: null, error: { message: 'update failed' } });
    const service = new SqlServerDatabaseProviderService(db);

    await expect(
      service.updateAdoShadowTaskStatus('task-uuid', 'done'),
    ).rejects.toThrow(
      'ADO status update failed for task task-uuid: update failed',
    );
  });
});
