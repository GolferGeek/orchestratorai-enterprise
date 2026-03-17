import { SlackWorkTaskSinkService } from './slack-work-task-sink.service';
import { DatabaseService } from '../database';
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

const SLACK_DEFAULTS: Record<string, string> = {
  FLOW_DEFAULT_TEAM_ID: 'team-1',
  SLACK_DEFAULT_CHANNEL_ID: 'C0123456789',
  SLACK_BOT_TOKEN: 'xoxb-test-token',
};

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const values = { ...SLACK_DEFAULTS, ...overrides };
  return {
    get: jest.fn((key: string, def?: string) => values[key] ?? def ?? undefined),
  } as unknown as ConfigService;
}

describe('SlackWorkTaskSinkService', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  describe('constructor', () => {
    it('throws when required config is missing', () => {
      // makeConfig with empty string triggers requireConfig validation in constructor
      const configWithEmptyToken = {
        get: jest.fn((key: string) => {
          if (key === 'SLACK_BOT_TOKEN') return '';
          if (key === 'FLOW_DEFAULT_TEAM_ID') return 'team-1';
          if (key === 'SLACK_DEFAULT_CHANNEL_ID') return 'C0123456789';
          return undefined;
        }),
      } as unknown as ConfigService;
      expect(() => {
        new SlackWorkTaskSinkService(makeDb({ data: null, error: null }), configWithEmptyToken);
      }).toThrow('SLACK_BOT_TOKEN is required');
    });
  });

  describe('createTask', () => {
    it('inserts a DB row, posts a Slack message, and updates external_task_id', async () => {
      const dbInsertResult = { data: { id: 'uuid-1', title: 'New task' }, error: null };
      const dbUpdateResult = { data: null, error: null };
      let callCount = 0;
      const fromMock = jest.fn(() => {
        callCount++;
        if (callCount === 1) return makeQueryBuilder(dbInsertResult); // insert task
        return makeQueryBuilder(dbUpdateResult);                       // update external_task_id
      });
      const db = {
        from: fromMock,
        checkConnection: jest.fn(),
        getConfig: jest.fn(),
        rpc: jest.fn(),
      } as unknown as DatabaseService;

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, ts: '1234567890.123456' }),
      });

      const svc = new SlackWorkTaskSinkService(db, makeConfig());
      const result = await svc.createTask({ title: 'New task', teamId: 'team-1' });

      expect(result).toEqual({
        id: 'uuid-1',
        title: 'New task',
        provider: 'slack',
        externalId: '1234567890.123456',
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://slack.com/api/chat.postMessage',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws when title is empty', async () => {
      const db = makeDb({ data: null, error: null });
      const svc = new SlackWorkTaskSinkService(db, makeConfig());

      await expect(svc.createTask({ title: '' })).rejects.toThrow('title is required');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws when FLOW_DEFAULT_TEAM_ID is missing (constructor validation)', () => {
      // SlackWorkTaskSinkService calls requireConfig in constructor,
      // so the error is thrown at construction time, not at createTask time.
      const db = makeDb({ data: null, error: null });
      expect(() => {
        new SlackWorkTaskSinkService(
          db,
          makeConfig({ FLOW_DEFAULT_TEAM_ID: '' }),
        );
      }).toThrow('FLOW_DEFAULT_TEAM_ID is required');
    });

    it('throws when DB task row creation fails', async () => {
      const db = makeDb({ data: null, error: { message: 'row insert failed' } });
      const svc = new SlackWorkTaskSinkService(db, makeConfig());

      await expect(svc.createTask({ title: 'Task', teamId: 'team-1' })).rejects.toThrow(
        'Failed to create Slack task row: row insert failed',
      );
    });

    it('throws when Slack postMessage returns non-ok HTTP status', async () => {
      const db = makeDb({ data: { id: 'uuid-1', title: 'Task' }, error: null });
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      });
      const svc = new SlackWorkTaskSinkService(db, makeConfig());

      await expect(svc.createTask({ title: 'Task', teamId: 'team-1' })).rejects.toThrow(
        'Slack chat.postMessage failed (503): Service Unavailable',
      );
    });

    it('throws when Slack postMessage returns ok=false payload', async () => {
      const db = makeDb({ data: { id: 'uuid-1', title: 'Task' }, error: null });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: false, error: 'channel_not_found' }),
      });
      const svc = new SlackWorkTaskSinkService(db, makeConfig());

      await expect(svc.createTask({ title: 'Task', teamId: 'team-1' })).rejects.toThrow(
        'channel_not_found',
      );
    });

    it('throws when external_task_id DB update fails', async () => {
      const dbInsertResult = { data: { id: 'uuid-2', title: 'Task' }, error: null };
      const dbUpdateResult = { data: null, error: { message: 'update failed' } };
      let callCount = 0;
      const fromMock = jest.fn(() => {
        callCount++;
        if (callCount === 1) return makeQueryBuilder(dbInsertResult);
        return makeQueryBuilder(dbUpdateResult);
      });
      const db = {
        from: fromMock,
        checkConnection: jest.fn(),
        getConfig: jest.fn(),
        rpc: jest.fn(),
      } as unknown as DatabaseService;

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, ts: '111.222' }),
      });

      const svc = new SlackWorkTaskSinkService(db, makeConfig());

      await expect(svc.createTask({ title: 'Task', teamId: 'team-1' })).rejects.toThrow(
        'Failed to persist Slack external_task_id: update failed',
      );
    });

    it('sends description in Slack message when provided', async () => {
      const db = makeDb({ data: { id: 'uuid-desc', title: 'Task' }, error: null });
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, ts: '1.1' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

      const svc = new SlackWorkTaskSinkService(db, makeConfig());
      await svc.createTask({ title: 'Task', teamId: 'team-1', description: 'Do this thing' });

      const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body ?? '{}') as {
        text?: string;
      };
      expect(body.text).toContain('Do this thing');
    });
  });

  describe('updateTaskStatus', () => {
    it('updates DB status and posts status message to Slack', async () => {
      const taskLookupResult = {
        data: { id: 'uuid-1', title: 'My Task', external_task_id: '111.222' },
        error: null,
      };
      const dbUpdateResult = { data: null, error: null };
      let callCount = 0;
      const fromMock = jest.fn(() => {
        callCount++;
        if (callCount === 1) return makeQueryBuilder(taskLookupResult); // getSharedTaskById
        return makeQueryBuilder(dbUpdateResult);                         // update
      });
      const db = {
        from: fromMock,
        checkConnection: jest.fn(),
        getConfig: jest.fn(),
        rpc: jest.fn(),
      } as unknown as DatabaseService;

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, ts: '333.444' }),
      });

      const svc = new SlackWorkTaskSinkService(db, makeConfig());
      await svc.updateTaskStatus({ taskId: 'uuid-1', status: 'done' });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://slack.com/api/chat.postMessage',
        expect.objectContaining({ method: 'POST' }),
      );
      const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body ?? '{}') as {
        text?: string;
        thread_ts?: string;
      };
      expect(body.text).toContain('done');
      expect(body.thread_ts).toBe('111.222');
    });

    it('throws when taskId is missing', async () => {
      const db = makeDb({ data: null, error: null });
      const svc = new SlackWorkTaskSinkService(db, makeConfig());

      await expect(svc.updateTaskStatus({ taskId: '', status: 'done' })).rejects.toThrow(
        'taskId and status are required',
      );
    });

    it('throws when status is missing', async () => {
      const db = makeDb({ data: null, error: null });
      const svc = new SlackWorkTaskSinkService(db, makeConfig());

      await expect(svc.updateTaskStatus({ taskId: 'uuid-1', status: '' })).rejects.toThrow(
        'taskId and status are required',
      );
    });

    it('throws when task lookup fails', async () => {
      const db = makeDb({ data: null, error: { message: 'not found' } });
      const svc = new SlackWorkTaskSinkService(db, makeConfig());

      await expect(
        svc.updateTaskStatus({ taskId: 'uuid-1', status: 'done' }),
      ).rejects.toThrow('Failed to fetch Slack task uuid-1: not found');
    });

    it('throws when DB update fails', async () => {
      const taskLookupResult = {
        data: { id: 'uuid-1', title: 'My Task', external_task_id: null },
        error: null,
      };
      const dbUpdateResult = { data: null, error: { message: 'update error' } };
      let callCount = 0;
      const fromMock = jest.fn(() => {
        callCount++;
        if (callCount === 1) return makeQueryBuilder(taskLookupResult);
        return makeQueryBuilder(dbUpdateResult);
      });
      const db = {
        from: fromMock,
        checkConnection: jest.fn(),
        getConfig: jest.fn(),
        rpc: jest.fn(),
      } as unknown as DatabaseService;

      const svc = new SlackWorkTaskSinkService(db, makeConfig());

      await expect(
        svc.updateTaskStatus({ taskId: 'uuid-1', status: 'done' }),
      ).rejects.toThrow('Failed to update Slack task status: update error');
    });
  });

  describe('addTaskComment', () => {
    it('fetches task and posts comment to Slack as thread reply', async () => {
      const taskLookupResult = {
        data: { id: 'uuid-1', title: 'My Task', external_task_id: '555.666' },
        error: null,
      };
      const db = makeDb(taskLookupResult);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, ts: '777.888' }),
      });

      const svc = new SlackWorkTaskSinkService(db, makeConfig());
      await svc.addTaskComment({ taskId: 'uuid-1', comment: 'All done!' });

      const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body ?? '{}') as {
        text?: string;
        thread_ts?: string;
      };
      expect(body.text).toContain('All done!');
      expect(body.thread_ts).toBe('555.666');
    });

    it('throws when taskId is missing', async () => {
      const db = makeDb({ data: null, error: null });
      const svc = new SlackWorkTaskSinkService(db, makeConfig());

      await expect(
        svc.addTaskComment({ taskId: '', comment: 'hi' }),
      ).rejects.toThrow('taskId and comment are required');
    });

    it('throws when comment is missing', async () => {
      const db = makeDb({ data: null, error: null });
      const svc = new SlackWorkTaskSinkService(db, makeConfig());

      await expect(
        svc.addTaskComment({ taskId: 'uuid-1', comment: '' }),
      ).rejects.toThrow('taskId and comment are required');
    });

    it('throws when task lookup fails', async () => {
      const db = makeDb({ data: null, error: { message: 'task gone' } });
      const svc = new SlackWorkTaskSinkService(db, makeConfig());

      await expect(
        svc.addTaskComment({ taskId: 'uuid-1', comment: 'Comment' }),
      ).rejects.toThrow('Failed to fetch Slack task uuid-1: task gone');
    });

    it('posts without thread_ts when task has no external_task_id', async () => {
      const taskLookupResult = {
        data: { id: 'uuid-1', title: 'My Task', external_task_id: null },
        error: null,
      };
      const db = makeDb(taskLookupResult);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, ts: '999.000' }),
      });

      const svc = new SlackWorkTaskSinkService(db, makeConfig());
      await svc.addTaskComment({ taskId: 'uuid-1', comment: 'No thread' });

      const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body ?? '{}') as {
        thread_ts?: string;
      };
      expect(body.thread_ts).toBeUndefined();
    });
  });
});
