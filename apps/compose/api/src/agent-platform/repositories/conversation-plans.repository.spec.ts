import { DatabaseService } from '@/database';
import { ConversationPlanRecord } from '../interfaces/conversation-plan-record.interface';
import { ConversationPlansRepository } from './conversation-plans.repository';

const createDbMock = () => {
  const fromMock = jest.fn();
  const db = { from: fromMock } as unknown as DatabaseService;
  return { fromMock, db };
};

describe('ConversationPlansRepository', () => {
  afterEach(() => jest.resetAllMocks());

  const planRecord: ConversationPlanRecord = {
    id: 'plan-1',
    conversation_id: 'conv-1',
    organization_slug: 'my-org',
    agent_slug: 'marketing_swarm',
    version: 1,
    status: 'draft',
    summary: 'summary',
    plan_json: { phases: [] },
    created_by: 'user-1',
    approved_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it('creates draft plans', async () => {
    const { fromMock, db } = createDbMock();
    const maybeSingle = jest
      .fn()
      .mockResolvedValue({ data: planRecord, error: null });
    const select = jest.fn().mockReturnValue({ maybeSingle });
    const insert = jest.fn().mockReturnValue({ select });
    fromMock.mockReturnValue({ insert });

    const repo = new ConversationPlansRepository(db);
    const result = await repo.createDraft({
      conversation_id: planRecord.conversation_id,
      organization_slug: planRecord.organization_slug,
      agent_slug: planRecord.agent_slug,
      plan_json: planRecord.plan_json,
    });

    expect(fromMock).toHaveBeenCalledWith(null, 'conversation_plans');
    expect(insert).toHaveBeenCalled();
    expect(result).toEqual(planRecord);
  });

  it('updates plan status', async () => {
    const { fromMock, db } = createDbMock();
    const maybeSingle = jest.fn().mockResolvedValue({
      data: { ...planRecord, status: 'approved' },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ maybeSingle });
    const eq = jest.fn().mockReturnValue({ select });
    const update = jest.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ update });

    const repo = new ConversationPlansRepository(db);
    const result = await repo.updateStatus('plan-1', {
      status: 'approved',
      approved_by: 'manager-1',
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved' }),
    );
    expect(result.status).toBe('approved');
  });

  it('lists plans by conversation', async () => {
    const { fromMock, db } = createDbMock();
    const order = jest
      .fn()
      .mockResolvedValue({ data: [planRecord], error: null });
    const eq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ select });

    const repo = new ConversationPlansRepository(db);
    const result = await repo.listByConversation('conv-1');

    expect(eq).toHaveBeenCalledWith('conversation_id', 'conv-1');
    expect(result).toEqual([planRecord]);
  });
});
