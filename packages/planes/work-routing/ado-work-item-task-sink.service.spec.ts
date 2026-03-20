import { AdoWorkItemTaskSinkService } from './ado-work-item-task-sink.service';
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

const ADO_DEFAULTS: Record<string, string> = {
  ADO_ORG_URL: 'https://dev.azure.com/testorg',
  ADO_PROJECT: 'TestProject',
  ADO_PAT: 'test-pat-token',
  ADO_WORK_ITEM_TYPE: 'Task',
  FLOW_DEFAULT_TEAM_ID: 'team-1',
  FLOW_DEFAULT_CHANNEL_ID: '',
};

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const values = { ...ADO_DEFAULTS, ...overrides };
  return {
    get: jest.fn((key: string, def?: string) => values[key] ?? def ?? ''),
  } as unknown as ConfigService;
}

describe('AdoWorkItemTaskSinkService', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  describe('createTask', () => {
    it('calls ADO API and persists shadow task, returns CreatedWorkTask', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 42,
          fields: { 'System.Title': 'Build feature X' },
        }),
        text: async () => '',
      });

      const dbResult = { data: { id: 'uuid-shadow', title: 'Build feature X' }, error: null };
      const db = makeDb(dbResult);
      const svc = new AdoWorkItemTaskSinkService(makeConfig(), db);

      const result = await svc.createTask({ title: 'Build feature X', teamId: 'team-1' });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('_apis/wit/workitems/$Task'),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result).toEqual({
        id: 'uuid-shadow',
        title: 'Build feature X',
        provider: 'ado',
        externalId: '42',
      });
    });

    it('throws when title is missing', async () => {
      const db = makeDb({ data: null, error: null });
      const svc = new AdoWorkItemTaskSinkService(makeConfig(), db);

      await expect(svc.createTask({ title: '' })).rejects.toThrow('title is required');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws when ADO API config is missing', async () => {
      const db = makeDb({ data: null, error: null });
      const svc = new AdoWorkItemTaskSinkService(
        makeConfig({ ADO_ORG_URL: '' }),
        db,
      );

      await expect(svc.createTask({ title: 'My task' })).rejects.toThrow(
        'ADO_ORG_URL is required',
      );
    });

    it('throws when ADO API returns non-ok response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      const db = makeDb({ data: null, error: null });
      const svc = new AdoWorkItemTaskSinkService(makeConfig(), db);

      await expect(svc.createTask({ title: 'My task' })).rejects.toThrow(
        'ADO work item creation failed (401): Unauthorized',
      );
    });

    it('throws when ADO API returns no id', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ fields: {} }),
        text: async () => '',
      });

      const db = makeDb({ data: null, error: null });
      const svc = new AdoWorkItemTaskSinkService(makeConfig(), db);

      await expect(svc.createTask({ title: 'My task' })).rejects.toThrow(
        'ADO work item creation returned no id',
      );
    });

    it('throws when shadow task persistence fails', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 99, fields: {} }),
        text: async () => '',
      });

      const db = makeDb({ data: null, error: { message: 'db error' } });
      const svc = new AdoWorkItemTaskSinkService(makeConfig(), db);

      await expect(svc.createTask({ title: 'My task' })).rejects.toThrow(
        'Failed to persist ADO task mapping: db error',
      );
    });

    it('falls back to input.title when ADO response System.Title is empty', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 55, fields: { 'System.Title': '' } }),
        text: async () => '',
      });

      const db = makeDb({ data: { id: 'uuid-55', title: 'Fallback title' }, error: null });
      const svc = new AdoWorkItemTaskSinkService(makeConfig(), db);

      const result = await svc.createTask({ title: 'Fallback title' });
      expect(result.title).toBe('Fallback title');
    });
  });

  describe('updateTaskStatus', () => {
    it('maps status to ADO state and calls PATCH', async () => {
      // ADO PATCH call
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () => '',
      });

      // DB lookup for resolveAdoTaskId is NOT called when taskId is numeric
      const db = makeDb({ data: null, error: null });
      const svc = new AdoWorkItemTaskSinkService(makeConfig(), db);

      await svc.updateTaskStatus({ taskId: '42', status: 'done' });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/workitems/42'),
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    it('resolves UUID task to externalId via DB lookup', async () => {
      const dbLookupResult = { data: { external_task_id: '77' }, error: null };
      const dbUpdateResult = { data: null, error: null };
      let callCount = 0;
      const fromMock = jest.fn(() => {
        callCount++;
        if (callCount === 1) return makeQueryBuilder(dbLookupResult);
        return makeQueryBuilder(dbUpdateResult);
      });
      const db = {
        from: fromMock,
        checkConnection: jest.fn(),
        getConfig: jest.fn(),
        rpc: jest.fn(),
      } as unknown as DatabaseService;

      fetchMock.mockResolvedValueOnce({ ok: true, text: async () => '' });

      const svc = new AdoWorkItemTaskSinkService(makeConfig(), db);

      // Use a valid RFC 4122 UUID: version=4 (variant bit [1-5]), variant=[89ab]
      await svc.updateTaskStatus({
        taskId: 'a1b2c3d4-1111-4111-8111-000000000001',
        status: 'done',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/workitems/77'),
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    it('throws when taskId is missing', async () => {
      const db = makeDb({ data: null, error: null });
      const svc = new AdoWorkItemTaskSinkService(makeConfig(), db);

      await expect(svc.updateTaskStatus({ taskId: '', status: 'done' })).rejects.toThrow(
        'taskId and status are required',
      );
    });

    it('throws on unsupported taskId format', async () => {
      const db = makeDb({ data: null, error: null });
      const svc = new AdoWorkItemTaskSinkService(makeConfig(), db);

      await expect(
        svc.updateTaskStatus({ taskId: 'not-a-uuid-or-number', status: 'done' }),
      ).rejects.toThrow("Unsupported taskId format 'not-a-uuid-or-number'");
    });

    it('maps known statuses to correct ADO states', async () => {
      // pending → Active
      fetchMock.mockResolvedValueOnce({ ok: true, text: async () => '' });
      const db = makeDb({ data: null, error: null });
      const svc = new AdoWorkItemTaskSinkService(makeConfig(), db);

      await svc.updateTaskStatus({ taskId: '1', status: 'pending' });

      const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body ?? '[]') as Array<{
        op: string;
        path: string;
        value: string;
      }>;
      const stateField = body.find((f) => f.path === '/fields/System.State');
      expect(stateField?.value).toBe('Active');
    });

    it('throws when ADO PATCH fails', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });
      const db = makeDb({ data: null, error: null });
      const svc = new AdoWorkItemTaskSinkService(makeConfig(), db);

      await expect(
        svc.updateTaskStatus({ taskId: '42', status: 'done' }),
      ).rejects.toThrow('ADO status update failed (403): Forbidden');
    });

    it('throws on unmapped status value', async () => {
      const db = makeDb({ data: null, error: null });
      const svc = new AdoWorkItemTaskSinkService(makeConfig(), db);

      await expect(
        svc.updateTaskStatus({ taskId: '42', status: 'unknown-status' }),
      ).rejects.toThrow("Unsupported internal status 'unknown-status'");
    });
  });

  describe('addTaskComment', () => {
    it('posts a comment to ADO when taskId is numeric', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, text: async () => '' });
      const db = makeDb({ data: null, error: null });
      const svc = new AdoWorkItemTaskSinkService(makeConfig(), db);

      await svc.addTaskComment({ taskId: '42', comment: 'All good' });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/workItems/42/comments'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws when taskId is missing', async () => {
      const db = makeDb({ data: null, error: null });
      const svc = new AdoWorkItemTaskSinkService(makeConfig(), db);

      await expect(
        svc.addTaskComment({ taskId: '', comment: 'hi' }),
      ).rejects.toThrow('taskId and comment are required');
    });

    it('throws when comment is missing', async () => {
      const db = makeDb({ data: null, error: null });
      const svc = new AdoWorkItemTaskSinkService(makeConfig(), db);

      await expect(
        svc.addTaskComment({ taskId: '42', comment: '' }),
      ).rejects.toThrow('taskId and comment are required');
    });

    it('throws when ADO comment POST fails', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });
      const db = makeDb({ data: null, error: null });
      const svc = new AdoWorkItemTaskSinkService(makeConfig(), db);

      await expect(
        svc.addTaskComment({ taskId: '42', comment: 'Comment' }),
      ).rejects.toThrow('ADO comment creation failed (500): Internal Server Error');
    });
  });
});
