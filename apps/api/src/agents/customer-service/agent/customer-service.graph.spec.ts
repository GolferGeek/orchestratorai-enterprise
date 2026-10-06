import { MemorySaver } from '@langchain/langgraph';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { createCustomerServiceGraph } from './customer-service.graph';
import type { CustomerServiceState } from './customer-service.state';

describe('customer-service graph', () => {
  const context = Object.freeze(
    createMockExecutionContext({
      orgSlug: 'acme',
      agentSlug: 'customer-service',
      agentType: 'langgraph',
    }),
  );
  const observability = {
    emitStarted: jest.fn().mockResolvedValue(undefined),
    emitProgress: jest.fn().mockResolvedValue(undefined),
    emitCompleted: jest.fn().mockResolvedValue(undefined),
    emitFailed: jest.fn().mockResolvedValue(undefined),
  };

  it('loads the company profile once at the start and answers from it', async () => {
    const llm = {
      callLLM: jest.fn().mockResolvedValue({ text: 'schedule_demo' }),
    };
    const profileLoader = {
      load: jest.fn().mockResolvedValue({
        orgSlug: 'acme',
        name: 'Acme Labs',
        contact: { email: 'help@acme.test', bookingUrl: 'https://acme.test/book' },
      }),
    };
    const retriever = { retrieve: jest.fn() };
    const graph = await createCustomerServiceGraph(
      llm as never,
      observability as never,
      new MemorySaver(),
      profileLoader,
      retriever,
    );

    const final = (await graph.invoke(
      {
        executionContext: context,
        userMessage: 'Can I book a demo?',
        conversationHistory: [],
        interactionMode: 'text',
        status: 'started',
        startedAt: Date.now(),
      },
      { configurable: { thread_id: context.conversationId } },
    )) as CustomerServiceState;

    expect(profileLoader.load).toHaveBeenCalledTimes(1);
    expect(profileLoader.load).toHaveBeenCalledWith(context);
    expect(final.status).toBe('completed');
    expect(final.intent).toBe('schedule_demo');
    expect(final.response).toContain('https://acme.test/book');
    expect(final.response).toContain('help@acme.test');
    expect(retriever.retrieve).not.toHaveBeenCalled();
  });

  it('fails the invocation when the organization profile cannot be loaded', async () => {
    const llm = { callLLM: jest.fn() };
    const profileLoader = {
      load: jest.fn().mockRejectedValue(new Error('settings.customerService is missing')),
    };
    const graph = await createCustomerServiceGraph(
      llm as never,
      observability as never,
      new MemorySaver(),
      profileLoader,
      { retrieve: jest.fn() },
    );

    await expect(
      graph.invoke(
        {
          executionContext: context,
          userMessage: 'hi',
          status: 'started',
          startedAt: Date.now(),
        },
        { configurable: { thread_id: 'thread-2' } },
      ),
    ).rejects.toThrow('settings.customerService is missing');
    expect(llm.callLLM).not.toHaveBeenCalled();
  });
});
