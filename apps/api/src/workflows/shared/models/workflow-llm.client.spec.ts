import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { LLMServiceProvider } from '@orchestratorai/planes/llm';
import { WorkflowLlmClient } from './workflow-llm.client';

function setup(response: unknown) {
  const llm = { generateUnifiedResponse: jest.fn(async () => response) };
  const client = new WorkflowLlmClient(llm as unknown as LLMServiceProvider);
  const executionContext = createMockExecutionContext({
    agentSlug: 'exec-digest',
    agentType: 'workflow',
    provider: 'ollama',
    model: 'qwen3:8b',
  });
  const scope = {
    executionContext,
    modelProfile: { drafter: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' } },
  };
  return { llm, client, scope, executionContext };
}

const answered = {
  content: '{"summary":"ok"}',
  metadata: {
    provider: 'openrouter',
    model: 'google/gemini-2.5-flash-lite',
    requestId: 'openrouter-1-abc',
    usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 },
  },
};

describe('WorkflowLlmClient.callForRole', () => {
  it("calls the role's model explicitly with the context whole and unchanged", async () => {
    const { llm, client, scope, executionContext } = setup(answered);
    const result = await client.callForRole(scope, 'drafter', {
      systemPrompt: 'Summarize',
      userMessage: '{}',
      callerName: 'agent:digest-writer',
      responseFormat: 'json',
    });

    expect(llm.generateUnifiedResponse).toHaveBeenCalledWith({
      provider: 'openrouter',
      model: 'google/gemini-2.5-flash-lite',
      systemPrompt: 'Summarize',
      userMessage: '{}',
      options: {
        executionContext,
        includeMetadata: true,
        callerType: 'workflow',
        callerName: 'agent:digest-writer',
        responseFormat: 'json',
      },
    });
    expect(executionContext.model).toBe('qwen3:8b');
    expect(result).toEqual({
      content: '{"summary":"ok"}',
      provider: 'openrouter',
      model: 'google/gemini-2.5-flash-lite',
      requestId: 'openrouter-1-abc',
      usage: { inputTokens: 12, outputTokens: 5 },
      thinking: null,
    });
  });

  it('refuses a role the run has no model for', async () => {
    const { llm, client, scope } = setup(answered);
    await expect(
      client.callForRole(scope, 'critic', { systemPrompt: '', userMessage: '', callerName: 'x' }),
    ).rejects.toThrow('has no model for role "critic"');
    expect(llm.generateUnifiedResponse).not.toHaveBeenCalled();
  });

  it('fails on a text-only or error response instead of guessing', async () => {
    const request = { systemPrompt: '', userMessage: '', callerName: 'x' };
    await expect(setup('plain text').client.callForRole(setup('x').scope, 'drafter', request)).rejects.toThrow(
      'without metadata',
    );
    const failed = setup({ ...answered, error: { code: 'E', message: 'rate limited' } });
    await expect(failed.client.callForRole(failed.scope, 'drafter', request)).rejects.toThrow(
      'rate limited',
    );
  });
});
