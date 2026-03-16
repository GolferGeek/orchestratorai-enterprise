import { DatabaseService } from '@/database';
import { HumanApprovalsRepository } from './human-approvals.repository';
import {
  HumanApprovalCreateInput,
  HumanApprovalRecord,
} from '../interfaces/human-approval-record.interface';

const createDbMock = () => {
  const fromMock = jest.fn();
  const db = { from: fromMock } as unknown as DatabaseService;
  return { fromMock, db };
};

describe('HumanApprovalsRepository', () => {
  afterEach(() => jest.resetAllMocks());

  const mockApproval: HumanApprovalRecord = {
    id: 'approval-1',
    organization_slug: 'test-org',
    agent_slug: 'test-agent',
    conversation_id: 'conv-1',
    task_id: 'task-1',
    orchestration_run_id: 'run-1',
    orchestration_step_id: 'step-1',
    mode: 'plan',
    status: 'pending',
    metadata: {},
    approved_by: null,
    decision_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  describe('create', () => {
    it('should create a new human approval record', async () => {
      const { fromMock, db } = createDbMock();
      const input: HumanApprovalCreateInput = {
        organizationSlug: 'test-org',
        agentSlug: 'test-agent',
        conversationId: 'conv-1',
        taskId: 'task-1',
        orchestrationRunId: 'run-1',
        orchestrationStepId: 'step-1',
        mode: 'plan',
        metadata: { key: 'value' },
      };

      const single = jest
        .fn()
        .mockResolvedValue({ data: mockApproval, error: null });
      const select = jest.fn().mockReturnValue({ single });
      const insert = jest.fn().mockReturnValue({ select });
      fromMock.mockReturnValue({ insert });

      const repo = new HumanApprovalsRepository(db);
      const result = await repo.create(input);

      expect(fromMock).toHaveBeenCalledWith(null, 'human_approvals');
      expect(insert).toHaveBeenCalledWith({
        organization_slug: 'test-org',
        agent_slug: 'test-agent',
        conversation_id: 'conv-1',
        task_id: 'task-1',
        orchestration_run_id: 'run-1',
        orchestration_step_id: 'step-1',
        mode: 'plan',
        status: 'pending',
        metadata: { key: 'value' },
      });
      expect(result).toEqual(mockApproval);
    });

    it('should throw error when creation fails', async () => {
      const { fromMock, db } = createDbMock();
      const input: HumanApprovalCreateInput = {
        organizationSlug: 'test-org',
        agentSlug: 'test-agent',
        mode: 'build',
      };

      const single = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });
      const select = jest.fn().mockReturnValue({ single });
      const insert = jest.fn().mockReturnValue({ select });
      fromMock.mockReturnValue({ insert });

      const repo = new HumanApprovalsRepository(db);

      await expect(repo.create(input)).rejects.toThrow(
        'Failed to create approval: Database error',
      );
    });
  });

  describe('setStatus', () => {
    it('should update approval status', async () => {
      const { fromMock, db } = createDbMock();
      const updatedApproval = {
        ...mockApproval,
        status: 'approved',
        approved_by: 'user-1',
      };

      const single = jest
        .fn()
        .mockResolvedValue({ data: updatedApproval, error: null });
      const select = jest.fn().mockReturnValue({ single });
      const eq = jest.fn().mockReturnValue({ select });
      const update = jest.fn().mockReturnValue({ eq });
      fromMock.mockReturnValue({ update });

      const repo = new HumanApprovalsRepository(db);
      const result = await repo.setStatus('approval-1', 'approved', 'user-1');

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'approved',
          approved_by: 'user-1',
          decision_at: expect.any(String) as string,
        }),
      );
      expect(eq).toHaveBeenCalledWith('id', 'approval-1');
      expect(result).toEqual(updatedApproval);
    });

    it('should update status with metadata', async () => {
      const { fromMock, db } = createDbMock();
      const metadata = { reason: 'test' };
      const updatedApproval = { ...mockApproval, status: 'rejected', metadata };

      const single = jest
        .fn()
        .mockResolvedValue({ data: updatedApproval, error: null });
      const select = jest.fn().mockReturnValue({ single });
      const eq = jest.fn().mockReturnValue({ select });
      const update = jest.fn().mockReturnValue({ eq });
      fromMock.mockReturnValue({ update });

      const repo = new HumanApprovalsRepository(db);
      const result = await repo.setStatus(
        'approval-1',
        'rejected',
        undefined,
        metadata,
      );

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata,
        }),
      );
      expect(result.status).toBe('rejected');
    });

    it('should throw error when update fails', async () => {
      const { fromMock, db } = createDbMock();

      const single = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Update error' },
      });
      const select = jest.fn().mockReturnValue({ single });
      const eq = jest.fn().mockReturnValue({ select });
      const update = jest.fn().mockReturnValue({ eq });
      fromMock.mockReturnValue({ update });

      const repo = new HumanApprovalsRepository(db);

      await expect(repo.setStatus('approval-1', 'approved')).rejects.toThrow(
        'Failed to update approval: Update error',
      );
    });
  });

  describe('get', () => {
    it('should retrieve approval by id', async () => {
      const { fromMock, db } = createDbMock();

      const maybeSingle = jest
        .fn()
        .mockResolvedValue({ data: mockApproval, error: null });
      const eq = jest.fn().mockReturnValue({ maybeSingle });
      const select = jest.fn().mockReturnValue({ eq });
      fromMock.mockReturnValue({ select });

      const repo = new HumanApprovalsRepository(db);
      const result = await repo.get('approval-1');

      expect(eq).toHaveBeenCalledWith('id', 'approval-1');
      expect(result).toEqual(mockApproval);
    });

    it('should return null when approval not found', async () => {
      const { fromMock, db } = createDbMock();

      const maybeSingle = jest
        .fn()
        .mockResolvedValue({ data: null, error: null });
      const eq = jest.fn().mockReturnValue({ maybeSingle });
      const select = jest.fn().mockReturnValue({ eq });
      fromMock.mockReturnValue({ select });

      const repo = new HumanApprovalsRepository(db);
      const result = await repo.get('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('listPendingByRun', () => {
    it('should list pending approvals for a run', async () => {
      const { fromMock, db } = createDbMock();
      const approvals = [mockApproval, { ...mockApproval, id: 'approval-2' }];

      const order = jest
        .fn()
        .mockResolvedValue({ data: approvals, error: null });
      const eq2 = jest.fn().mockReturnValue({ order });
      const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
      const select = jest.fn().mockReturnValue({ eq: eq1 });
      fromMock.mockReturnValue({ select });

      const repo = new HumanApprovalsRepository(db);
      const result = await repo.listPendingByRun('run-1');

      expect(result).toEqual(approvals);
    });

    it('should throw error when list fails', async () => {
      const { fromMock, db } = createDbMock();

      const order = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Query error' },
      });
      const eq2 = jest.fn().mockReturnValue({ order });
      const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
      const select = jest.fn().mockReturnValue({ eq: eq1 });
      fromMock.mockReturnValue({ select });

      const repo = new HumanApprovalsRepository(db);

      await expect(repo.listPendingByRun('run-1')).rejects.toThrow(
        'Failed to list approvals for run run-1: Query error',
      );
    });
  });

  describe('list', () => {
    it('should list approvals with default options', async () => {
      const { fromMock, db } = createDbMock();
      const approvals = [mockApproval];

      const range = jest.fn().mockResolvedValue({
        data: approvals,
        error: null,
        count: 1,
      });
      const order = jest.fn().mockReturnValue({ range });
      const select = jest.fn().mockReturnValue({ order });
      fromMock.mockReturnValue({ select });

      const repo = new HumanApprovalsRepository(db);
      const result = await repo.list();

      expect(result.data).toEqual(approvals);
      expect(result.count).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('should filter by organization slug', async () => {
      const { fromMock, db } = createDbMock();

      const range = jest
        .fn()
        .mockResolvedValue({ data: [], error: null, count: 0 });
      const order = jest.fn().mockReturnValue({ range });
      const eq = jest.fn().mockReturnValue({ order });
      const select = jest.fn().mockReturnValue({ eq });
      fromMock.mockReturnValue({ select });

      const repo = new HumanApprovalsRepository(db);
      await repo.list({ organizationSlug: 'test-org' });

      expect(eq).toHaveBeenCalledWith('organization_slug', 'test-org');
    });

    it('should filter by status', async () => {
      const { fromMock, db } = createDbMock();

      const range = jest
        .fn()
        .mockResolvedValue({ data: [], error: null, count: 0 });
      const order = jest.fn().mockReturnValue({ range });
      const eq = jest.fn().mockReturnValue({ order });
      const select = jest.fn().mockReturnValue({ eq });
      fromMock.mockReturnValue({ select });

      const repo = new HumanApprovalsRepository(db);
      await repo.list({ status: 'approved' });

      expect(eq).toHaveBeenCalledWith('status', 'approved');
    });

    it('should apply pagination', async () => {
      const { fromMock, db } = createDbMock();

      const range = jest
        .fn()
        .mockResolvedValue({ data: [], error: null, count: 0 });
      const order = jest.fn().mockReturnValue({ range });
      const select = jest.fn().mockReturnValue({ order });
      fromMock.mockReturnValue({ select });

      const repo = new HumanApprovalsRepository(db);
      await repo.list({ limit: 10, offset: 20 });

      expect(range).toHaveBeenCalledWith(20, 29);
    });

    it('should clamp limit to max 200', async () => {
      const { fromMock, db } = createDbMock();

      const range = jest
        .fn()
        .mockResolvedValue({ data: [], error: null, count: 0 });
      const order = jest.fn().mockReturnValue({ range });
      const select = jest.fn().mockReturnValue({ order });
      fromMock.mockReturnValue({ select });

      const repo = new HumanApprovalsRepository(db);
      const result = await repo.list({ limit: 500 });

      expect(result.limit).toBe(200);
      expect(range).toHaveBeenCalledWith(0, 199);
    });
  });

  describe('listByRunIds', () => {
    it('should list approvals by run ids', async () => {
      const { fromMock, db } = createDbMock();
      const approvals = [mockApproval];

      const order = jest
        .fn()
        .mockResolvedValue({ data: approvals, error: null });
      const inClause = jest.fn().mockReturnValue({ order });
      const select = jest.fn().mockReturnValue({ in: inClause });
      fromMock.mockReturnValue({ select });

      const repo = new HumanApprovalsRepository(db);
      const result = await repo.listByRunIds(['run-1', 'run-2']);

      expect(inClause).toHaveBeenCalledWith('orchestration_run_id', [
        'run-1',
        'run-2',
      ]);
      expect(result).toEqual(approvals);
    });

    it('should return empty array when no run ids provided', async () => {
      const { db } = createDbMock();

      const repo = new HumanApprovalsRepository(db);
      const result = await repo.listByRunIds([]);

      expect(result).toEqual([]);
    });
  });

  describe('countPendingByRunIds', () => {
    it('should count pending approvals by run id', async () => {
      const { fromMock, db } = createDbMock();
      const records = [
        { id: 'approval-1', orchestration_run_id: 'run-1' },
        { id: 'approval-2', orchestration_run_id: 'run-1' },
        { id: 'approval-3', orchestration_run_id: 'run-2' },
      ];

      const eq = jest.fn().mockResolvedValue({ data: records, error: null });
      const inClause = jest.fn().mockReturnValue({ eq });
      const select = jest.fn().mockReturnValue({ in: inClause });
      fromMock.mockReturnValue({ select });

      const repo = new HumanApprovalsRepository(db);
      const result = await repo.countPendingByRunIds(['run-1', 'run-2']);

      expect(result).toEqual({
        'run-1': 2,
        'run-2': 1,
      });
    });

    it('should return empty object when no run ids provided', async () => {
      const { db } = createDbMock();

      const repo = new HumanApprovalsRepository(db);
      const result = await repo.countPendingByRunIds([]);

      expect(result).toEqual({});
    });
  });
});
