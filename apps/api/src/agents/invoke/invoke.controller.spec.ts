import { JsonRpcErrorCode, createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { Response } from 'express';

jest.mock('./providers-models.service', () => ({
  ProvidersModelsService: class ProvidersModelsService {},
}));

import { InvokeController } from './invoke.controller';

const context = createMockExecutionContext({
  orgSlug: 'acme',
  userId: 'user-1',
  conversationId: 'conversation-1',
  agentSlug: 'context-agent',
});

function request(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id: 'request-1',
    method: 'invoke',
    params: { context, data: { content: 'hello' } },
    ...overrides,
  };
}

function responseMock(): jest.Mocked<
  Pick<
    Response,
    | 'status'
    | 'json'
    | 'setHeader'
    | 'flushHeaders'
    | 'write'
    | 'end'
    | 'writableEnded'
  >
> {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    writableEnded: false,
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response as never;
}

describe('InvokeController hardening', () => {
  const dispatch = {
    invoke: jest.fn(),
    invokeStream: jest.fn(),
  };
  const agentDefs = { listAgents: jest.fn() };
  const providersModels = { fetchProvidersAndModels: jest.fn() };
  const conversations = {
    fetchForUser: jest.fn(),
    fetchMessagesForUser: jest.fn(),
    deleteForUser: jest.fn(),
  };

  let controller: InvokeController;

  beforeEach(() => {
    jest.clearAllMocks();
    dispatch.invoke.mockResolvedValue({ content: 'answer', outputType: 'text' });
    dispatch.invokeStream.mockResolvedValue(undefined);
    agentDefs.listAgents.mockResolvedValue([]);
    providersModels.fetchProvidersAndModels.mockResolvedValue({
      providers: [],
      models: [],
    });
    conversations.fetchForUser.mockResolvedValue([]);
    conversations.fetchMessagesForUser.mockResolvedValue([]);
    conversations.deleteForUser.mockResolvedValue(undefined);

    controller = new InvokeController(
      dispatch as never,
      agentDefs as never,
      providersModels as never,
      conversations as never,
    );
  });

  it('validates the full envelope and passes the context capsule whole', async () => {
    const body = request();

    const response = await controller.invoke(
      body,
      { id: 'user-1' },
      { organizationSlug: 'acme' },
    );

    expect(dispatch.invoke).toHaveBeenCalledWith(
      context,
      { content: 'hello' },
      undefined,
    );
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 'request-1',
      result: {
        success: true,
        output: { content: 'answer', outputType: 'text' },
        context,
      },
    });
  });

  it('rejects a userId that does not match the authenticated user', async () => {
    const response = await controller.invoke(
      request(),
      { id: 'other-user' },
      { organizationSlug: 'acme' },
    );

    expect(dispatch.invoke).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      error: {
        code: JsonRpcErrorCode.INVALID_PARAMS,
        message: expect.stringContaining('authenticated user'),
      },
    });
  });

  it('rejects a context organization that differs from the RBAC-authorized organization', async () => {
    const response = await controller.invoke(
      request(),
      { id: 'user-1' },
      { organizationSlug: 'other-org' },
    );

    expect(dispatch.invoke).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      error: {
        code: JsonRpcErrorCode.INVALID_PARAMS,
        message: expect.stringContaining('authorized organization'),
      },
    });
  });

  it('does not expose dispatcher error details', async () => {
    dispatch.invoke.mockRejectedValueOnce(
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
        message: 'Agent invocation failed',
      },
    });
    expect(JSON.stringify(response)).not.toContain('secret-password');
  });

  it('authorizes conversation message reads through the conversation service', async () => {
    await controller.getConversationMessages(
      'conversation-1',
      { id: 'user-1' },
      { organizationSlug: 'acme' },
    );

    expect(conversations.fetchMessagesForUser).toHaveBeenCalledWith(
      'conversation-1',
      'user-1',
      'acme',
    );
  });

  it('authorizes conversation deletion through the conversation service', async () => {
    await controller.deleteConversation(
      'conversation-1',
      { id: 'user-1' },
      { organizationSlug: 'acme' },
    );

    expect(conversations.deleteForUser).toHaveBeenCalledWith(
      'conversation-1',
      'user-1',
      'acme',
    );
  });

  it('uses the RBAC-bound organization for agent catalog queries', async () => {
    await controller.listAgents({ organizationSlug: 'authorized-org' });

    expect(agentDefs.listAgents).toHaveBeenCalledWith('authorized-org');
  });

  it('rejects an unknown model type before querying the provider plane', async () => {
    await expect(
      controller.listProvidersAndModels('embedding'),
    ).rejects.toThrow('Unsupported model_type');
    expect(providersModels.fetchProvidersAndModels).not.toHaveBeenCalled();
  });

  it('validates stream requests before opening the SSE response', async () => {
    const response = responseMock();

    await controller.invokeStream(
      request({ method: 'converse' }),
      response as never,
      { id: 'user-1' },
      { organizationSlug: 'acme' },
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.flushHeaders).not.toHaveBeenCalled();
    expect(dispatch.invokeStream).not.toHaveBeenCalled();
  });

  it('does not expose stream dispatcher errors', async () => {
    const response = responseMock();
    dispatch.invokeStream.mockRejectedValueOnce(new Error('private stack detail'));

    await controller.invokeStream(
      request(),
      response as never,
      { id: 'user-1' },
      { organizationSlug: 'acme' },
    );

    const written = response.write.mock.calls.flat().join('\n');
    expect(written).toContain('Agent invocation failed');
    expect(written).not.toContain('private stack detail');
    expect(response.end).toHaveBeenCalled();
  });
});
