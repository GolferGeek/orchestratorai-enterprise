import { InvokeDispatchService } from '../../agents/invoke/invoke-dispatch.service';
import { A2ARouterService } from './a2a-router.service';

describe('A2ARouterService', () => {
  function createService() {
    const dispatch = {
      invoke: jest.fn(async () => ({
        content: 'done',
        outputType: 'text',
      })),
    } as unknown as InvokeDispatchService;
    return { service: new A2ARouterService(dispatch), dispatch };
  }

  const context = {
    orgSlug: 'trusted-org',
    userId: 'external:signed-agent',
    conversationId: '10000000-0000-4000-8000-000000000001',
    agentSlug: 'contract-assistant',
    agentType: 'context',
    provider: 'external-a2a',
    model: 'registered-agent',
  };

  it('routes invoke using the context target type', () => {
    const { service } = createService();
    expect(service.resolveRoute('invoke', { context: { ...context, agentType: 'ambient' } })).toMatchObject({
      product: 'ambient',
    });
    expect(service.resolveRoute('invoke', { context: { ...context, agentType: 'workflow' } })).toMatchObject({
      product: 'workflows',
    });
    expect(service.resolveRoute('invoke', { context })).toMatchObject({
      product: 'agents',
    });
  });

  it('passes a validated external ExecutionContext whole', async () => {
    const { service, dispatch } = createService();
    const target = service.resolveRoute('invoke', { context });

    await service.forwardRequest(
      target,
      {
        jsonrpc: '2.0',
        id: 'request-1',
        method: 'invoke',
        params: {
          context,
          data: { content: 'hello' },
        },
      },
      'signed-agent',
      'trusted-org',
    );

    expect(dispatch.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        orgSlug: 'trusted-org',
        userId: 'external:signed-agent',
        agentSlug: 'contract-assistant',
        agentType: 'context',
      }),
      { content: 'hello' },
      expect.objectContaining({ externalAgentId: 'signed-agent' }),
    );
  });
});
