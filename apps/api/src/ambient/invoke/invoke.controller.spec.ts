import { JsonRpcErrorCode } from '@orchestrator-ai/transport-types';
import { AmbientInvokeController } from './invoke.controller';
import { AmbientDispatchService } from './ambient-dispatch.service';

const validRequest = {
  jsonrpc: '2.0' as const,
  id: 'request-1',
  method: 'invoke' as const,
  params: {
    context: {
      orgSlug: 'acme',
      userId: 'user-1',
      conversationId: 'conversation-1',
      agentSlug: 'ambient',
      agentType: 'automation',
      provider: 'openai',
      model: 'gpt-test',
    },
    data: { content: 'hello' },
  },
};

describe('AmbientInvokeController', () => {
  it('rejects malformed and identity-spoofed requests without dispatching', async () => {
    const dispatch = { invoke: jest.fn() } as unknown as AmbientDispatchService;
    const controller = new AmbientInvokeController(dispatch);

    await expect(controller.invoke(null, { id: 'user-1' })).resolves.toMatchObject({
      error: { code: JsonRpcErrorCode.INVALID_PARAMS },
    });
    await expect(
      controller.invoke(validRequest, { id: 'other-user' }),
    ).resolves.toMatchObject({
      error: { code: JsonRpcErrorCode.INVALID_PARAMS },
    });
    expect(dispatch.invoke).not.toHaveBeenCalled();
  });

  it('passes the complete validated context to dispatch', async () => {
    const output = { content: 'done', outputType: 'text' as const };
    const dispatch = {
      invoke: jest.fn(async () => output),
    } as unknown as AmbientDispatchService;
    const controller = new AmbientInvokeController(dispatch);

    await expect(
      controller.invoke(validRequest, { id: 'user-1' }),
    ).resolves.toMatchObject({ result: { success: true, output } });
    expect(dispatch.invoke).toHaveBeenCalledWith(
      validRequest.params.context,
      validRequest.params.data,
      undefined,
    );
  });

  it('does not expose internal exception messages', async () => {
    const dispatch = {
      invoke: jest.fn(async () => {
        throw new Error('database password appeared here');
      }),
    } as unknown as AmbientDispatchService;
    const controller = new AmbientInvokeController(dispatch);

    const result = await controller.invoke(validRequest, { id: 'user-1' });
    expect(result).toMatchObject({
      error: {
        code: JsonRpcErrorCode.INTERNAL_ERROR,
        message: 'Ambient invocation failed',
      },
    });
    expect(JSON.stringify(result)).not.toContain('database password');
  });
});
