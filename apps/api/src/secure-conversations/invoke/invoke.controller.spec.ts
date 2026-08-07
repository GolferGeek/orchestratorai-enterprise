import { JsonRpcErrorCode } from '@orchestrator-ai/transport-types';
import { SecureConversationsInvokeController } from './invoke.controller';
import { SecureConversationsDispatchService } from './secure-conversations-dispatch.service';

const validRequest = {
  jsonrpc: '2.0' as const,
  id: 'request-1',
  method: 'invoke' as const,
  params: {
    context: {
      orgSlug: 'acme',
      userId: 'user-1',
      conversationId: 'conversation-1',
      agentSlug: 'secure-conversations',
      agentType: 'external',
      provider: 'openai',
      model: 'gpt-test',
    },
    data: { content: 'hello' },
  },
};

describe('SecureConversationsInvokeController', () => {
  it('rejects malformed and identity-spoofed requests without dispatching', async () => {
    const dispatch = {
      invoke: jest.fn(),
    } as unknown as SecureConversationsDispatchService;
    const controller = new SecureConversationsInvokeController(dispatch);

    await expect(controller.invoke([], { id: 'user-1' })).resolves.toMatchObject({
      error: { code: JsonRpcErrorCode.INVALID_PARAMS },
    });
    await expect(
      controller.invoke(validRequest, { id: 'other-user' }),
    ).resolves.toMatchObject({
      error: { code: JsonRpcErrorCode.INVALID_PARAMS },
    });
    expect(dispatch.invoke).not.toHaveBeenCalled();
  });

  it('dispatches valid requests and keeps context intact', async () => {
    const output = { content: 'done', outputType: 'text' as const };
    const dispatch = {
      invoke: jest.fn(async () => output),
    } as unknown as SecureConversationsDispatchService;
    const controller = new SecureConversationsInvokeController(dispatch);

    await expect(
      controller.invoke(validRequest, { id: 'user-1' }),
    ).resolves.toMatchObject({ result: { success: true, output } });
    expect(dispatch.invoke).toHaveBeenCalledWith(
      validRequest.params.context,
      validRequest.params.data,
      undefined,
    );
  });

  it('returns a generic internal error', async () => {
    const dispatch = {
      invoke: jest.fn(async () => {
        throw new Error('sensitive upstream detail');
      }),
    } as unknown as SecureConversationsDispatchService;
    const controller = new SecureConversationsInvokeController(dispatch);

    const result = await controller.invoke(validRequest, { id: 'user-1' });
    expect(result).toMatchObject({
      error: {
        code: JsonRpcErrorCode.INTERNAL_ERROR,
        message: 'Secure Conversations invocation failed',
      },
    });
    expect(JSON.stringify(result)).not.toContain('sensitive upstream');
  });
});
