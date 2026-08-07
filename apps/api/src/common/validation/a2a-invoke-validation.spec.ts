import { validateA2AInvokeRequest } from './a2a-invoke-validation';

const context = {
  orgSlug: 'acme',
  userId: 'user-1',
  conversationId: 'conversation-1',
  agentSlug: 'agent-1',
  agentType: 'context',
  provider: 'openai',
  model: 'gpt-test',
};

function request(overrides: Record<string, unknown> = {}) {
  return {
    jsonrpc: '2.0',
    id: 'request-1',
    method: 'invoke',
    params: {
      context,
      data: { content: 'hello' },
    },
    ...overrides,
  };
}

describe('validateA2AInvokeRequest', () => {
  it('accepts a complete request for the authenticated user', () => {
    expect(validateA2AInvokeRequest(request(), 'user-1', 'acme')).toMatchObject({
      valid: true,
    });
  });

  it.each([
    [null, 'Invalid JSON-RPC request'],
    [{}, 'Invalid JSON-RPC request'],
    [request({ jsonrpc: '1.0' }), 'Invalid JSON-RPC request'],
    [request({ method: 'agents.invoke' }), 'Invalid JSON-RPC request'],
    [request({ id: undefined }), 'Invalid JSON-RPC request'],
  ])('rejects malformed envelope %#', (body, message) => {
    expect(validateA2AInvokeRequest(body, 'user-1')).toMatchObject({
      valid: false,
      message: expect.stringContaining(message),
    });
  });

  it('rejects an incomplete execution context', () => {
    expect(
      validateA2AInvokeRequest(
        request({
          params: {
            context: { ...context, provider: '' },
            data: { content: 'hello' },
          },
        }),
        'user-1',
      ),
    ).toMatchObject({ valid: false, message: expect.stringContaining('context') });
  });

  it('rejects user identity spoofing', () => {
    expect(validateA2AInvokeRequest(request(), 'other-user')).toMatchObject({
      valid: false,
      message: expect.stringContaining('authenticated user'),
    });
  });

  it('rejects organization spoofing when RBAC authorized a different tenant', () => {
    expect(validateA2AInvokeRequest(request(), 'user-1', 'other-org')).toMatchObject({
      valid: false,
      message: expect.stringContaining('authorized organization'),
    });
  });

  it('allows an explicit super-admin organization scope', () => {
    expect(validateA2AInvokeRequest(request(), 'user-1', '*')).toMatchObject({
      valid: true,
    });
  });

  it.each([
    ['envelope', request({ unexpected: true })],
    [
      'params',
      request({
        params: {
          context,
          data: { content: 'hello' },
          unexpected: true,
        },
      }),
    ],
    [
      'context',
      request({
        params: {
          context: { ...context, taskId: 'must-not-cross-transport' },
          data: { content: 'hello' },
        },
      }),
    ],
    [
      'data',
      request({
        params: {
          context,
          data: { content: 'hello', mode: 'converse' },
        },
      }),
    ],
  ])('rejects custom fields outside the frozen %s contract', (_part, body) => {
    expect(validateA2AInvokeRequest(body, 'user-1', 'acme')).toMatchObject({
      valid: false,
      message: expect.stringContaining('unsupported'),
    });
  });

  it('rejects a non-boolean sovereignMode', () => {
    expect(
      validateA2AInvokeRequest(
        request({
          params: {
            context: { ...context, sovereignMode: 'true' },
            data: { content: 'hello' },
          },
        }),
        'user-1',
        'acme',
      ),
    ).toMatchObject({ valid: false, message: expect.stringContaining('context') });
  });

  it('rejects an unsupported contentType', () => {
    expect(
      validateA2AInvokeRequest(
        request({
          params: {
            context,
            data: { content: 'hello', contentType: 'executable' },
          },
        }),
        'user-1',
        'acme',
      ),
    ).toMatchObject({
      valid: false,
      message: expect.stringContaining('contentType'),
    });
  });

  it('requires data.content while allowing an explicit null payload', () => {
    expect(
      validateA2AInvokeRequest(
        request({ params: { context, data: {} } }),
        'user-1',
      ),
    ).toMatchObject({ valid: false });
    expect(
      validateA2AInvokeRequest(
        request({ params: { context, data: { content: null } } }),
        'user-1',
      ),
    ).toMatchObject({ valid: true });
  });

  it('rejects non-object metadata', () => {
    expect(
      validateA2AInvokeRequest(
        request({
          params: { context, data: { content: 'hello' }, metadata: [] },
        }),
        'user-1',
      ),
    ).toMatchObject({ valid: false, message: expect.stringContaining('metadata') });
  });
});
