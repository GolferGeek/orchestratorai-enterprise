import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { WorkflowLlmClient } from '../models/workflow-llm.client';
import { AgentSchemaError } from './agent-contract';
import type { AgentDefinition } from './agent-definition.types';
import type { AgentDefinitionsRepository } from './agent-definitions.repository';
import { AgentInputError, AgentOutputError, AgentUnavailableError } from './agent-errors';
import { WorkflowAgentRuntime } from './workflow-agent.runtime';

const scorer: AgentDefinition = {
  slug: 'risk-scorer',
  name: 'Risk scorer',
  description: 'Scores one risk dimension',
  instructions: 'Score the proposition.',
  modelRole: 'analyst',
  outputFormat: 'json',
  inputSchema: {
    type: 'object',
    properties: { proposition: { type: 'string', minLength: 1 } },
    required: ['proposition'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: { score: { type: 'integer', minimum: 0, maximum: 100 }, reason: { type: 'string' } },
    required: ['score', 'reason'],
    additionalProperties: false,
  },
  maxTokens: 800,
  enabled: true,
  version: 3,
};

function setup(definition: AgentDefinition | null = scorer, content = '{"score":40,"reason":"ok"}') {
  const repo = {
    listAll: jest.fn(async () => (definition ? [definition] : [])),
    getForOrg: jest.fn(async () => definition),
  };
  const call = {
    content,
    provider: 'openrouter',
    model: 'google/gemini-2.5-flash-lite',
    requestId: 'req-1',
    usage: { inputTokens: 10, outputTokens: 5 },
    thinking: null,
  };
  const llm = { callForRole: jest.fn(async () => call) };
  const runtime = new WorkflowAgentRuntime(
    repo as unknown as AgentDefinitionsRepository,
    llm as unknown as WorkflowLlmClient,
  );
  const scope = {
    executionContext: createMockExecutionContext({ orgSlug: 'corporate', agentType: 'workflow' }),
    modelProfile: { analyst: { provider: 'openrouter', model: 'google/gemini-2.5-flash-lite' } },
  };
  return { runtime, repo, llm, scope, call };
}

const input = { proposition: 'Open a Berlin office' };

describe('WorkflowAgentRuntime', () => {
  it("calls the agent's role with its instructions and schema, and returns checked output", async () => {
    const { runtime, llm, scope, call } = setup();
    const result = await runtime.invoke(scope, 'risk-scorer', input);

    expect(llm.callForRole).toHaveBeenCalledWith(scope, 'analyst', {
      systemPrompt: expect.stringContaining('"additionalProperties": false'),
      userMessage: JSON.stringify(input, null, 2),
      callerName: 'agent:risk-scorer',
      maxTokens: 800,
      responseFormat: 'json',
    });
    expect(result).toEqual({ output: { score: 40, reason: 'ok' }, definitionVersion: 3, modelRole: 'analyst', call });
  });

  it('reads an answer wrapped in reasoning and one fence', async () => {
    const { runtime, scope } = setup(scorer, '<think>hmm</think>\n```json\n{"score":1,"reason":"r"}\n```');
    await expect(runtime.invoke(scope, 'risk-scorer', input)).resolves.toMatchObject({
      output: { score: 1, reason: 'r' },
    });
  });

  it.each([
    ['a number sent as a string', '{"score":"40","reason":"ok"}'],
    ['an extra property', '{"score":40,"reason":"ok","confidence":0.9}'],
    ['an envelope around the answer', '{"output":{"score":40,"reason":"ok"}}'],
    ['a null for a required field', '{"score":null,"reason":"ok"}'],
    ['prose around the JSON', 'Here you go: {"score":40,"reason":"ok"}'],
  ])('rejects %s and keeps the raw answer and call', async (_label, content) => {
    const { runtime, scope, call } = setup(scorer, content);
    const error = await runtime.invoke(scope, 'risk-scorer', input).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AgentOutputError);
    expect(error).toMatchObject({ raw: content, call });
  });

  it('checks input strictly before any model call', async () => {
    const { runtime, llm, scope } = setup();
    await expect(runtime.invoke(scope, 'risk-scorer', { proposition: '' })).rejects.toBeInstanceOf(AgentInputError);
    await expect(runtime.invoke(scope, 'risk-scorer', { ...input, extra: 1 })).rejects.toBeInstanceOf(AgentInputError);
    expect(llm.callForRole).not.toHaveBeenCalled();
  });

  it('refuses a missing or disabled agent', async () => {
    const missing = setup(null);
    await expect(missing.runtime.invoke(missing.scope, 'risk-scorer', input)).rejects.toThrow('does not exist');
    const disabled = setup({ ...scorer, enabled: false });
    await expect(disabled.runtime.invoke(disabled.scope, 'risk-scorer', input)).rejects.toBeInstanceOf(
      AgentUnavailableError,
    );
    expect(disabled.llm.callForRole).not.toHaveBeenCalled();
  });

  it('returns a text agent answer as text, without asking for JSON', async () => {
    const writer = { ...scorer, slug: 'memo-writer', outputFormat: 'text' as const, outputSchema: null };
    const { runtime, llm, scope } = setup(writer, 'The memo.');
    await expect(runtime.invoke(scope, 'memo-writer', input)).resolves.toMatchObject({ output: 'The memo.' });
    expect(llm.callForRole).toHaveBeenCalledWith(
      scope,
      'analyst',
      expect.not.objectContaining({ responseFormat: 'json' }),
    );
  });

  it('fails boot on a schema that does not compile, instead of validating permissively', async () => {
    const broken = { ...scorer, outputSchema: { type: 'object', propertiez: {} } };
    await expect(setup(broken).runtime.onModuleInit()).rejects.toBeInstanceOf(AgentSchemaError);
  });
});
