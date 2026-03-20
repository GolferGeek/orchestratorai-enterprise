import { FlowSupabaseTaskSinkService } from './flow-supabase-task-sink.service';
import { DATABASE_SERVICE, DatabaseService } from '../database';
import { ConfigService } from '@nestjs/config';

function makeQueryBuilder(resultHolder: { data: unknown; error: unknown }) {
  const chainable: Record<string, jest.Mock> = {};
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'order', 'limit'];
  for (const m of methods) {
    chainable[m] = jest.fn().mockReturnThis();
  }
  chainable.single = jest.fn().mockImplementation(() =>
    Promise.resolve(resultHolder),
  );
  const thenFn = jest.fn((resolve) => resolve(resultHolder));
  (chainable as any).then = thenFn;
  return chainable;
}

function makeDb(resultHolder: { data: unknown; error: unknown }): DatabaseService {
  const qb = makeQueryBuilder(resultHolder);
  return {
    from: jest.fn(() => qb),
    checkConnection: jest.fn(),
    getConfig: jest.fn(),
    rpc: jest.fn(),
  } as unknown as DatabaseService;
}

function makeConfig(
  values: Record<string, string> = {},
): ConfigService {
  return {
    get: jest.fn((key: string, def?: string) => values[key] ?? def ?? ''),
  } as unknown as ConfigService;
}

describe('FlowSupabaseTaskSinkService', () => {
  describe('createTask', () => {
    it('inserts a task row and returns CreatedWorkTask', async () => {
      const result = { data: { id: 'uuid-1', title: 'Build feature X' }, error: null };
      const db = makeDb(result);
      const config = makeConfig({ FLOW_DEFAULT_TEAM_ID: 'team-1', FLOW_DEFAULT_CHANNEL_ID: '' });
      const svc = new FlowSupabaseTaskSinkService(db, config);

      const created = await svc.createTask({ title: 'Build feature X', teamId: 'team-1' });

      expect(created).toEqual({ id: 'uuid-1', title: 'Build feature X', provider: 'flow' });
      expect(db.from).toHaveBeenCalledWith('orch_flow', 'shared_tasks');
    });

    it('posts a channel message when channelId is provided', async () => {
      const result = { data: { id: 'uuid-2', title: 'Task with channel' }, error: null };
      const fromMock = jest.fn(() => {
        const qb = makeQueryBuilder(result);
        return qb;
      });
      const db = {
        from: fromMock,
        checkConnection: jest.fn(),
        getConfig: jest.fn(),
        rpc: jest.fn(),
      } as unknown as DatabaseService;
      const config = makeConfig({ FLOW_DEFAULT_TEAM_ID: 'team-1', FLOW_DEFAULT_CHANNEL_ID: 'ch-1' });
      const svc = new FlowSupabaseTaskSinkService(db, config);

      await svc.createTask({ title: 'Task with channel', teamId: 'team-1', channelId: 'ch-1' });

      // db.from should be called twice: once for task insert, once for channel message insert
      expect(fromMock).toHaveBeenCalledWith('orch_flow', 'shared_tasks');
      expect(fromMock).toHaveBeenCalledWith('orch_flow', 'channel_messages');
    });

    it('throws when title is missing', async () => {
      const result = { data: null, error: null };
      const db = makeDb(result);
      const config = makeConfig({ FLOW_DEFAULT_TEAM_ID: 'team-1' });
      const svc = new FlowSupabaseTaskSinkService(db, config);

      await expect(svc.createTask({ title: '' })).rejects.toThrow('title is required');
    });

    it('throws when teamId is not provided and no default', async () => {
      const result = { data: null, error: null };
      const db = makeDb(result);
      const config = makeConfig({});
      const svc = new FlowSupabaseTaskSinkService(db, config);

      await expect(svc.createTask({ title: 'Some task' })).rejects.toThrow(
        'teamId is required',
      );
    });

    it('throws when database insert returns error', async () => {
      const result = { data: null, error: { message: 'insert failed' } };
      const db = makeDb(result);
      const config = makeConfig({ FLOW_DEFAULT_TEAM_ID: 'team-1' });
      const svc = new FlowSupabaseTaskSinkService(db, config);

      await expect(svc.createTask({ title: 'Task', teamId: 'team-1' })).rejects.toThrow(
        'Failed to create task: insert failed',
      );
    });

    it('uses configService defaults for teamId and channelId', async () => {
      const result = { data: { id: 'uuid-def', title: 'Default task' }, error: null };
      const db = makeDb(result);
      const config = makeConfig({
        FLOW_DEFAULT_TEAM_ID: 'default-team',
        FLOW_DEFAULT_CHANNEL_ID: '',
      });
      const svc = new FlowSupabaseTaskSinkService(db, config);

      const created = await svc.createTask({ title: 'Default task' });

      expect(created.provider).toBe('flow');
      expect(created.id).toBe('uuid-def');
    });
  });

  describe('updateTaskStatus', () => {
    it('updates status and is_completed flag', async () => {
      const result = { data: null, error: null };
      const chainable = makeQueryBuilder(result);
      const db = {
        from: jest.fn(() => chainable),
        checkConnection: jest.fn(),
        getConfig: jest.fn(),
        rpc: jest.fn(),
      } as unknown as DatabaseService;
      const config = makeConfig();
      const svc = new FlowSupabaseTaskSinkService(db, config);

      await svc.updateTaskStatus({ taskId: 'uuid-1', status: 'done' });

      expect(chainable.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'done', is_completed: true }),
      );
      expect(chainable.eq).toHaveBeenCalledWith('id', 'uuid-1');
    });

    it('throws when taskId is missing', async () => {
      const db = makeDb({ data: null, error: null });
      const svc = new FlowSupabaseTaskSinkService(db, makeConfig());

      await expect(svc.updateTaskStatus({ taskId: '', status: 'done' })).rejects.toThrow(
        'taskId and status are required',
      );
    });

    it('throws when status is missing', async () => {
      const db = makeDb({ data: null, error: null });
      const svc = new FlowSupabaseTaskSinkService(db, makeConfig());

      await expect(svc.updateTaskStatus({ taskId: 'uuid-1', status: '' })).rejects.toThrow(
        'taskId and status are required',
      );
    });

    it('throws when database update returns error', async () => {
      const result = { data: null, error: { message: 'update failed' } };
      const chainable = makeQueryBuilder(result);
      const db = {
        from: jest.fn(() => chainable),
        checkConnection: jest.fn(),
        getConfig: jest.fn(),
        rpc: jest.fn(),
      } as unknown as DatabaseService;
      const svc = new FlowSupabaseTaskSinkService(db, makeConfig());

      await expect(
        svc.updateTaskStatus({ taskId: 'uuid-1', status: 'done' }),
      ).rejects.toThrow('Failed to update Flow task status: update failed');
    });
  });

  describe('addTaskComment', () => {
    it('looks up channel_id and inserts a channel_messages row', async () => {
      const lookupResult = { data: { channel_id: 'ch-abc' }, error: null };
      const insertResult = { data: null, error: null };
      let callCount = 0;
      const fromMock = jest.fn(() => {
        callCount++;
        if (callCount === 1) {
          return makeQueryBuilder(lookupResult);
        }
        return makeQueryBuilder(insertResult);
      });

      const db = {
        from: fromMock,
        checkConnection: jest.fn(),
        getConfig: jest.fn(),
        rpc: jest.fn(),
      } as unknown as DatabaseService;
      const svc = new FlowSupabaseTaskSinkService(db, makeConfig());

      await svc.addTaskComment({ taskId: 'uuid-1', comment: 'Looks good!' });

      expect(fromMock).toHaveBeenCalledWith('orch_flow', 'shared_tasks');
      expect(fromMock).toHaveBeenCalledWith('orch_flow', 'channel_messages');
    });

    it('throws when taskId is missing', async () => {
      const db = makeDb({ data: null, error: null });
      const svc = new FlowSupabaseTaskSinkService(db, makeConfig());

      await expect(svc.addTaskComment({ taskId: '', comment: 'hi' })).rejects.toThrow(
        'taskId and comment are required',
      );
    });

    it('throws when comment is missing', async () => {
      const db = makeDb({ data: null, error: null });
      const svc = new FlowSupabaseTaskSinkService(db, makeConfig());

      await expect(svc.addTaskComment({ taskId: 'uuid-1', comment: '' })).rejects.toThrow(
        'taskId and comment are required',
      );
    });

    it('throws when task lookup fails', async () => {
      const result = { data: null, error: { message: 'task not found' } };
      const db = makeDb(result);
      const svc = new FlowSupabaseTaskSinkService(db, makeConfig());

      await expect(
        svc.addTaskComment({ taskId: 'uuid-1', comment: 'Hello' }),
      ).rejects.toThrow('Failed to fetch Flow task channel: task not found');
    });

    it('throws when task has no channel_id', async () => {
      const result = { data: { channel_id: null }, error: null };
      const db = makeDb(result);
      const svc = new FlowSupabaseTaskSinkService(db, makeConfig());

      await expect(
        svc.addTaskComment({ taskId: 'uuid-1', comment: 'Hello' }),
      ).rejects.toThrow('has no channel_id');
    });

    it('throws when channel_messages insert fails', async () => {
      const lookupResult = { data: { channel_id: 'ch-abc' }, error: null };
      const insertResult = { data: null, error: { message: 'channel insert failed' } };
      let callCount = 0;
      const fromMock = jest.fn(() => {
        callCount++;
        if (callCount === 1) return makeQueryBuilder(lookupResult);
        return makeQueryBuilder(insertResult);
      });

      const db = {
        from: fromMock,
        checkConnection: jest.fn(),
        getConfig: jest.fn(),
        rpc: jest.fn(),
      } as unknown as DatabaseService;
      const svc = new FlowSupabaseTaskSinkService(db, makeConfig());

      await expect(
        svc.addTaskComment({ taskId: 'uuid-1', comment: 'Hello' }),
      ).rejects.toThrow('Failed to post Flow task comment: channel insert failed');
    });
  });
});
