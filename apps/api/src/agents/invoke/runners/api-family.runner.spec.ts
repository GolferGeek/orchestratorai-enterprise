import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { of } from 'rxjs';
import type { AgentDefinition } from '../agent-definition.types';

jest.mock('@orchestratorai/planes/llm', () => ({
  LLM_SERVICE: Symbol('LLM_SERVICE'),
}));

import { ApiFamilyRunner } from './api-family.runner';

const definition: AgentDefinition = {
  id: 'api-agent',
  slug: 'api-agent',
  name: 'API Agent',
  agentType: 'api',
  status: 'active',
  outputType: 'json',
  endpoint: 'https://api.example.test/invoke',
};

function response(data: unknown, status = 200) {
  return of({ status, data, headers: {} });
}

describe('ApiFamilyRunner outbound hardening', () => {
  const http = { request: jest.fn() };
  const llm = { generateUnifiedResponse: jest.fn() };
  const outboundUrls = { assertSafe: jest.fn() };
  let runner: ApiFamilyRunner;

  beforeEach(() => {
    jest.clearAllMocks();
    http.request.mockReturnValue(response({ result: 'safe result' }));
    outboundUrls.assertSafe.mockResolvedValue(
      new URL('https://api.example.test/invoke'),
    );
    runner = new ApiFamilyRunner(http as never, llm as never, outboundUrls as never);
  });

  it('validates the endpoint immediately before the request and disables redirects', async () => {
    await runner.invoke(definition, createMockExecutionContext(), {
      content: 'hello',
    });

    expect(outboundUrls.assertSafe).toHaveBeenCalledWith(definition.endpoint);
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.test/invoke',
        maxRedirects: 0,
        maxContentLength: expect.any(Number),
        maxBodyLength: expect.any(Number),
      }),
    );
  });

  it('does not send a request when the endpoint fails SSRF validation', async () => {
    outboundUrls.assertSafe.mockRejectedValueOnce(
      new Error('private network rejected'),
    );

    await expect(
      runner.invoke(
        { ...definition, endpoint: 'http://169.254.169.254/metadata' },
        createMockExecutionContext(),
        { content: 'hello' },
      ),
    ).rejects.toThrow('private network rejected');
    expect(http.request).not.toHaveBeenCalled();
  });

  it('does not reflect an upstream response body in its error', async () => {
    http.request.mockReturnValueOnce(
      response({ secret: 'upstream credential detail' }, 503),
    );

    const promise = runner.invoke(definition, createMockExecutionContext(), {
      content: 'hello',
    });
    await expect(promise).rejects.toThrow('status 503');
    await expect(promise).rejects.not.toThrow('upstream credential detail');
  });

  it('rejects malformed authentication configuration', async () => {
    await expect(
      runner.invoke(
        {
          ...definition,
          authConfig: { type: 'apikey', token: 'secret', header: 'Bad\r\nHeader' },
        },
        createMockExecutionContext(),
        { content: 'hello' },
      ),
    ).rejects.toThrow('authentication header');
    expect(http.request).not.toHaveBeenCalled();
  });
});
