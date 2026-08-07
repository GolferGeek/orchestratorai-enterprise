import { NotFoundException } from '@nestjs/common';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

jest.mock('./dual-track-processor.service', () => ({
  DualTrackProcessorService: class DualTrackProcessorService {},
}));

import { MarketingSwarmController } from './marketing-swarm.controller';

function invokeBody() {
  const context = createMockExecutionContext({
    orgSlug: 'acme',
    userId: 'user-1',
    agentSlug: 'marketing-swarm',
    agentType: 'workflow',
  });
  return {
    jsonrpc: '2.0',
    id: 'invoke-1',
    method: 'invoke',
    params: {
      context,
      data: {
        contentType: 'json',
        content: {
          contentTypeSlug: 'blog-post',
          promptData: {
            topic: 'Security',
            audience: 'Developers',
            goal: 'Explain',
            keyPoints: ['Ownership'],
            tone: 'Direct',
          },
          config: {
            writers: [
              {
                agentSlug: 'writer',
                llmProvider: 'anthropic',
                llmModel: 'model',
              },
            ],
            editors: [
              {
                agentSlug: 'editor',
                llmProvider: 'anthropic',
                llmModel: 'model',
              },
            ],
            evaluators: [
              {
                agentSlug: 'evaluator',
                llmProvider: 'anthropic',
                llmModel: 'model',
              },
            ],
            execution: {
              maxLocalConcurrent: 1,
              maxCloudConcurrent: 5,
              maxEditCycles: 2,
              topNForFinalRanking: 1,
            },
          },
        },
      },
    },
  };
}

describe('MarketingSwarmController A2A and ownership boundary', () => {
  const service = {
    execute: jest.fn(),
    getStatus: jest.fn(),
    getFullState: jest.fn(),
    getDeliverable: jest.fn(),
    getVersionedDeliverable: jest.fn(),
    deleteTask: jest.fn(),
    getOutputVersions: jest.fn(),
    getOutputById: jest.fn(),
    getTaskByConversationId: jest.fn(),
  };
  let controller: MarketingSwarmController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new MarketingSwarmController(service as never);
  });

  it('accepts the A2A invoke contract and passes ExecutionContext whole', async () => {
    const body = invokeBody();
    const deliverable = { type: 'versioned', versions: [] };
    service.execute.mockResolvedValue({
      status: 'completed',
      versionedDeliverable: deliverable,
    });

    const response = await controller.invoke(
      body,
      { id: 'user-1' },
      { organizationSlug: 'acme' },
    );

    expect(service.execute).toHaveBeenCalledWith(
      expect.objectContaining({ context: body.params.context }),
    );
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 'invoke-1',
      result: {
        success: true,
        output: { content: deliverable, outputType: 'json' },
        context: body.params.context,
      },
    });
  });

  it('rejects a tenant-spoofed context before workflow execution', async () => {
    const body = invokeBody();
    body.params.context.orgSlug = 'other-org';

    const response = await controller.invoke(
      body,
      { id: 'user-1' },
      { organizationSlug: 'acme' },
    );

    expect(response).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: -32602 }),
      }),
    );
    expect(service.execute).not.toHaveBeenCalled();
  });

  it('does not expose workflow execution errors in the JSON-RPC response', async () => {
    service.execute.mockRejectedValue(new Error('database password leaked'));

    const response = await controller.invoke(
      invokeBody(),
      { id: 'user-1' },
      { organizationSlug: 'acme' },
    );

    expect(response).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          message: 'Workflow invocation failed',
        }),
      }),
    );
    expect(JSON.stringify(response)).not.toContain('database password');
  });

  it('passes authenticated user and RBAC-bound organization to state reads', async () => {
    service.getFullState.mockResolvedValue({ outputs: [], evaluations: [] });

    await controller.getState(
      'task-1',
      { id: 'user-1' },
      { organizationSlug: 'acme' },
    );

    expect(service.getFullState).toHaveBeenCalledWith('task-1', {
      userId: 'user-1',
      organizationSlug: 'acme',
    });
  });

  it('returns not found for an output outside the authenticated scope', async () => {
    service.getOutputVersions.mockResolvedValue(null);

    await expect(
      controller.getOutputVersions(
        'output-1',
        { id: 'user-1' },
        { organizationSlug: 'acme' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
