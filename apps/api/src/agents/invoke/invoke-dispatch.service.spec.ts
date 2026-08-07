import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import type { Response } from 'express';
import type { AgentDefinition } from './agent-definition.types';
import { InvokeDispatchService } from './invoke-dispatch.service';
import type { FamilyRunner } from './invoke-dispatch.service';

const context = createMockExecutionContext({
  orgSlug: 'acme',
  userId: 'user-1',
  conversationId: 'conversation-1',
  agentSlug: 'context-agent',
});

const definition: AgentDefinition = {
  id: 'context-agent',
  slug: 'context-agent',
  name: 'Context Agent',
  agentType: 'context',
  status: 'active',
  outputType: 'text',
};

function responseMock(): jest.Mocked<Pick<Response, 'write' | 'end'>> {
  return { write: jest.fn(), end: jest.fn() };
}

describe('InvokeDispatchService hardening', () => {
  const agentDefs = { resolve: jest.fn() };
  const observability = { emitInvocationEvent: jest.fn() };
  const runner: jest.Mocked<FamilyRunner> = { invoke: jest.fn() };

  const conversations = {
    select: jest.fn(),
    eq: jest.fn(),
    single: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  };
  const messages = { insert: jest.fn() };
  const database = { from: jest.fn() };

  let service: InvokeDispatchService;

  beforeEach(() => {
    jest.clearAllMocks();
    conversations.select.mockReturnValue(conversations);
    conversations.eq.mockReturnValue(conversations);
    conversations.update.mockReturnValue(conversations);
    conversations.single.mockResolvedValue({
      data: {
        id: 'conversation-1',
        user_id: 'user-1',
        organization_slug: 'acme',
        agent_name: 'context-agent',
        agent_type: 'context',
      },
      error: null,
    });
    conversations.insert.mockResolvedValue({ error: null });
    messages.insert.mockResolvedValue({ error: null });
    database.from.mockImplementation(
      (_schema: string | null, table: string) =>
        table === 'conversation_messages' ? messages : conversations,
    );
    agentDefs.resolve.mockResolvedValue(definition);
    observability.emitInvocationEvent.mockResolvedValue(undefined);
    runner.invoke.mockResolvedValue({ content: 'answer', outputType: 'text' });

    service = new InvokeDispatchService(
      agentDefs as never,
      observability as never,
      database as never,
    );
    service.registerRunner('context', runner);
  });

  it('rejects reuse of a conversation owned by another user before running the agent', async () => {
    conversations.single.mockResolvedValueOnce({
      data: {
        id: 'conversation-1',
        user_id: 'other-user',
        organization_slug: 'acme',
        agent_name: 'context-agent',
        agent_type: 'context',
      },
      error: null,
    });

    await expect(service.invoke(context, { content: 'hello' })).rejects.toThrow(
      'Conversation ownership mismatch',
    );
    expect(runner.invoke).not.toHaveBeenCalled();
  });

  it('rejects reuse of a conversation from another organization', async () => {
    conversations.single.mockResolvedValueOnce({
      data: {
        id: 'conversation-1',
        user_id: 'user-1',
        organization_slug: 'other-org',
        agent_name: 'context-agent',
        agent_type: 'context',
      },
      error: null,
    });

    await expect(service.invoke(context, { content: 'hello' })).rejects.toThrow(
      'Conversation ownership mismatch',
    );
    expect(runner.invoke).not.toHaveBeenCalled();
  });

  it('creates a missing conversation without an ownership-overwriting upsert', async () => {
    conversations.single.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    });

    await service.invoke(context, { content: 'hello' });

    expect(conversations.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'conversation-1',
        user_id: 'user-1',
        organization_slug: 'acme',
      }),
    );
  });

  it('persists both messages before returning a successful invocation', async () => {
    const output = await service.invoke(context, { content: 'hello' });

    expect(messages.insert).toHaveBeenCalledWith([
      expect.objectContaining({ role: 'user', content: 'hello' }),
      expect.objectContaining({ role: 'assistant', content: 'answer' }),
    ]);
    expect(conversations.update).toHaveBeenCalledWith({
      last_active_at: expect.any(String),
      last_output_type: 'text',
    });
    expect(output).toEqual({ content: 'answer', outputType: 'text' });
  });

  it('propagates message persistence failure and emits invocation.failed', async () => {
    messages.insert.mockResolvedValueOnce({
      error: { message: 'conversation storage unavailable' },
    });

    await expect(service.invoke(context, { content: 'hello' })).rejects.toThrow(
      'conversation storage unavailable',
    );
    expect(observability.emitInvocationEvent).toHaveBeenLastCalledWith(
      context,
      expect.objectContaining({ type: 'invocation.failed', success: false }),
    );
  });

  it('does not silently substitute a synchronous runner for streaming', async () => {
    const response = responseMock();

    await expect(
      service.invokeStream(
        context,
        { content: 'hello' },
        undefined,
        'request-1',
        response as never,
      ),
    ).rejects.toThrow('does not support streaming');
    expect(runner.invoke).not.toHaveBeenCalled();
    expect(response.write).not.toHaveBeenCalled();
  });

  it('delegates streaming only to a runner that implements the stream contract', async () => {
    const streamRunner = {
      invoke: jest.fn(),
      invokeStream: jest.fn().mockResolvedValue(undefined),
    };
    service.registerRunner('context', streamRunner);
    const response = responseMock();

    await service.invokeStream(
      context,
      { content: 'hello' },
      undefined,
      'request-1',
      response as never,
    );

    expect(streamRunner.invokeStream).toHaveBeenCalledWith(
      definition,
      context,
      { content: 'hello' },
      undefined,
      'request-1',
      response,
    );
  });
});
