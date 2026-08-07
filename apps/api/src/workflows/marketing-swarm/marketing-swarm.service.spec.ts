import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

jest.mock('./dual-track-processor.service', () => ({
  DualTrackProcessorService: class DualTrackProcessorService {},
}));

import { MarketingSwarmService } from './marketing-swarm.service';

describe('MarketingSwarmService hardening', () => {
  const processor = { processTask: jest.fn() };
  const db = {
    getTaskConfigForContext: jest.fn(),
    createTask: jest.fn(),
    getAllOutputs: jest.fn(),
    getAllEvaluations: jest.fn(),
    getDeliverable: jest.fn(),
    getVersionedDeliverable: jest.fn(),
    hasTaskAccess: jest.fn(),
    getOutputTaskId: jest.fn(),
    getOutputVersions: jest.fn(),
    getOutputById: jest.fn(),
  };
  let service: MarketingSwarmService;
  const context = createMockExecutionContext({
    orgSlug: 'acme',
    userId: 'user-1',
    agentSlug: 'marketing-swarm',
    agentType: 'workflow',
  });
  const input = {
    context,
    taskId: context.conversationId,
    contentTypeSlug: 'blog-post',
    promptData: { topic: 'Security' },
    config: {
      writers: [],
      editors: [],
      evaluators: [],
      execution: {},
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MarketingSwarmService(processor as never, db as never);
    db.getTaskConfigForContext.mockResolvedValue(null);
    db.getAllOutputs.mockResolvedValue([]);
    db.getAllEvaluations.mockResolvedValue([]);
    db.getDeliverable.mockResolvedValue({ taskId: context.conversationId });
    db.getVersionedDeliverable.mockResolvedValue({
      type: 'versioned',
      taskId: context.conversationId,
    });
  });

  it('creates a task with the complete context and executes it', async () => {
    await service.execute(input);

    expect(db.createTask).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ taskId: context.conversationId }),
    );
    expect(processor.processTask).toHaveBeenCalledWith(
      context.conversationId,
      context,
    );
  });

  it('propagates processor failure instead of returning an empty failed result', async () => {
    processor.processTask.mockRejectedValue(new Error('processor failed'));

    await expect(service.execute(input)).rejects.toThrow('processor failed');
    expect(db.getAllOutputs).not.toHaveBeenCalled();
  });

  it('does not read task state before ownership is established', async () => {
    db.hasTaskAccess.mockResolvedValue(false);

    await expect(
      service.getFullState('task-1', {
        userId: 'user-1',
        organizationSlug: 'acme',
      }),
    ).resolves.toBeNull();
    expect(db.getAllOutputs).not.toHaveBeenCalled();
    expect(db.getAllEvaluations).not.toHaveBeenCalled();
  });

  it('authorizes an output through its parent task before returning versions', async () => {
    db.getOutputTaskId.mockResolvedValue('task-1');
    db.hasTaskAccess.mockResolvedValue(true);
    db.getOutputVersions.mockResolvedValue([{ id: 'version-1' }]);

    await expect(
      service.getOutputVersions('output-1', {
        userId: 'user-1',
        organizationSlug: 'acme',
      }),
    ).resolves.toEqual([{ id: 'version-1' }]);
    expect(db.hasTaskAccess).toHaveBeenCalledWith('task-1', {
      userId: 'user-1',
      organizationSlug: 'acme',
    });
  });
});
