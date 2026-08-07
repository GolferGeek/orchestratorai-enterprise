import { JsonRpcErrorCode } from '@orchestrator-ai/transport-types';
import { PipelinesController } from './pipelines.controller';

const context = Object.freeze({
  orgSlug: 'acme',
  userId: 'user-1',
  conversationId: 'conversation-1',
  agentSlug: 'pipeline-builder',
  agentType: 'pipeline',
  provider: 'openai',
  model: 'gpt-test',
});

function request(
  content: unknown = {
    name: 'Research pipeline',
    runners: [{ runnerId: 'context' }],
  },
): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id: 'request-1',
    method: 'invoke',
    params: {
      context,
      data: { content, contentType: 'json' },
    },
  };
}

describe('PipelinesController A2A boundary', () => {
  const pipelines = {
    save: jest.fn(),
    list: jest.fn(),
  };
  let controller: PipelinesController;

  beforeEach(() => {
    jest.clearAllMocks();
    pipelines.save.mockResolvedValue({
      id: '10000000-0000-4000-8000-000000000001',
      name: 'Research pipeline',
      runners: [{ runnerId: 'context' }],
      createdAt: '2026-08-06T12:00:00.000Z',
    });
    pipelines.list.mockResolvedValue([]);
    controller = new PipelinesController(pipelines as never);
  });

  it('validates JSON-RPC and passes the frontend context capsule whole', async () => {
    const response = await controller.invoke(
      request(),
      { id: 'user-1' },
      { organizationSlug: 'acme' },
    );

    expect(pipelines.save).toHaveBeenCalledWith(context, {
      name: 'Research pipeline',
      runners: [{ runnerId: 'context' }],
    });
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 'request-1',
      result: {
        success: true,
        output: {
          content: {
            id: '10000000-0000-4000-8000-000000000001',
            name: 'Research pipeline',
            runners: [{ runnerId: 'context' }],
            createdAt: '2026-08-06T12:00:00.000Z',
          },
          outputType: 'json',
        },
        context,
      },
    });
  });

  it('rejects identity, tenant, target, and input violations before persistence', async () => {
    const wrongTarget = request();
    (wrongTarget.params as { context: Record<string, unknown> }).context = {
      ...context,
      agentSlug: 'other-agent',
    };

    const responses = await Promise.all([
      controller.invoke(
        request(),
        { id: 'other-user' },
        { organizationSlug: 'acme' },
      ),
      controller.invoke(
        request(),
        { id: 'user-1' },
        { organizationSlug: 'other-org' },
      ),
      controller.invoke(
        wrongTarget,
        { id: 'user-1' },
        { organizationSlug: 'acme' },
      ),
      controller.invoke(
        request({ name: '', runners: [] }),
        { id: 'user-1' },
        { organizationSlug: 'acme' },
      ),
    ]);

    expect(pipelines.save).not.toHaveBeenCalled();
    for (const response of responses) {
      expect(response).toMatchObject({
        error: { code: JsonRpcErrorCode.INVALID_PARAMS },
      });
    }
  });

  it('does not expose persistence error details', async () => {
    pipelines.save.mockRejectedValueOnce(
      new Error('postgresql://secret-user:secret-password@private-host'),
    );

    const response = await controller.invoke(
      request(),
      { id: 'user-1' },
      { organizationSlug: 'acme' },
    );

    expect(response).toMatchObject({
      error: {
        code: JsonRpcErrorCode.INTERNAL_ERROR,
        message: 'Pipeline save failed',
      },
    });
    expect(JSON.stringify(response)).not.toContain('secret-password');
  });

  it('uses only authenticated and RBAC-bound ownership for list queries', async () => {
    await controller.list({ id: 'user-1' }, { organizationSlug: 'acme' });

    expect(pipelines.list).toHaveBeenCalledWith('user-1', 'acme');
  });
});
