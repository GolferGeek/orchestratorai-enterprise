import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { of } from 'rxjs';
import type { AgentDefinition } from '../agent-definition.types';
import { ExternalFamilyRunner } from './external-family.runner';

const definition: AgentDefinition = {
  id: 'external-agent',
  slug: 'external-agent',
  name: 'External Agent',
  agentType: 'external',
  status: 'active',
  outputType: 'text',
  endpoint: 'https://agent.example.test/invoke',
};

function response(data: unknown, status = 200) {
  return of({ status, data, headers: {} });
}

describe('ExternalFamilyRunner outbound A2A hardening', () => {
  const http = { request: jest.fn() };
  const outboundUrls = { assertSafe: jest.fn() };
  let runner: ExternalFamilyRunner;

  beforeEach(() => {
    jest.clearAllMocks();
    outboundUrls.assertSafe.mockResolvedValue(
      new URL('https://agent.example.test/invoke'),
    );
    http.request.mockImplementation((config: { data: { id: string } }) =>
      response({
        jsonrpc: '2.0',
        id: config.data.id,
        result: {
          success: true,
          output: { content: 'answer', outputType: 'text' },
        },
      }),
    );
    runner = new ExternalFamilyRunner(http as never, outboundUrls as never);
  });

  it('validates the endpoint and sends the immutable context in a bounded no-redirect request', async () => {
    const context = Object.freeze(
      createMockExecutionContext({ agentSlug: 'external-agent' }),
    );

    await expect(
      runner.invoke(definition, context, { content: 'hello' }),
    ).resolves.toMatchObject({ content: 'answer', outputType: 'text' });

    expect(outboundUrls.assertSafe).toHaveBeenCalledWith(definition.endpoint);
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        maxRedirects: 0,
        maxContentLength: expect.any(Number),
        data: expect.objectContaining({
          jsonrpc: '2.0',
          method: 'invoke',
          params: expect.objectContaining({ context }),
        }),
      }),
    );
  });

  it('rejects a response whose JSON-RPC id does not match the request', async () => {
    http.request.mockReturnValueOnce(
      response({
        jsonrpc: '2.0',
        id: 'attacker-controlled-id',
        result: {
          success: true,
          output: { content: 'answer', outputType: 'text' },
        },
      }),
    );

    await expect(
      runner.invoke(definition, createMockExecutionContext(), {
        content: 'hello',
      }),
    ).rejects.toThrow('response id does not match');
  });

  it('rejects an unsupported output type', async () => {
    http.request.mockImplementationOnce((config: { data: { id: string } }) =>
      response({
        jsonrpc: '2.0',
        id: config.data.id,
        result: {
          success: true,
          output: { content: 'answer', outputType: 'executable' },
        },
      }),
    );

    await expect(
      runner.invoke(definition, createMockExecutionContext(), {
        content: 'hello',
      }),
    ).rejects.toThrow('invalid output');
  });

  it('rejects a private endpoint before network access', async () => {
    outboundUrls.assertSafe.mockRejectedValueOnce(
      new Error('private network rejected'),
    );

    await expect(
      runner.invoke(
        { ...definition, endpoint: 'http://127.0.0.1/admin' },
        createMockExecutionContext(),
        { content: 'hello' },
      ),
    ).rejects.toThrow('private network rejected');
    expect(http.request).not.toHaveBeenCalled();
  });
});
