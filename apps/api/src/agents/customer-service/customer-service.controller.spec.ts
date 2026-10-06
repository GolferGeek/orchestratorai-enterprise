import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

jest.mock('./agent/customer-service.service', () => ({
  CustomerServiceService: class CustomerServiceService {},
}));

import { CustomerServiceController } from './customer-service.controller';

describe('CustomerServiceController authenticated ExecutionContext', () => {
  const sessions = {
    createSession: jest.fn(),
    getClientContextConfig: jest.fn(),
    verifySessionToken: jest.fn(),
    saveTranscript: jest.fn(),
  };
  const auth = { validateUser: jest.fn() };
  const agent = { process: jest.fn() };
  let controller: CustomerServiceController;

  beforeEach(() => {
    jest.clearAllMocks();
    auth.validateUser.mockResolvedValue({ id: 'user-1' });
    agent.process.mockResolvedValue({ status: 'completed', response: 'hello' });
    controller = new CustomerServiceController(
      sessions as never,
      auth as never,
      agent as never,
    );
  });

  it('passes the frontend-originated guest context into session signing', () => {
    const context = createMockExecutionContext({
      orgSlug: 'acme',
      agentSlug: 'customer-service',
      agentType: 'langgraph',
    });
    sessions.createSession.mockReturnValue({
      sessionToken: 'signed',
      conversationId: context.conversationId,
    });

    controller.createSession({ context });

    expect(sessions.createSession).toHaveBeenCalledWith(context);
  });

  it('exposes the configured route and organization needed to create guest context in the browser', () => {
    sessions.getClientContextConfig.mockReturnValue({
      provider: 'anthropic',
      model: 'claude-sonnet',
      orgSlug: 'acme',
    });

    expect(controller.getContextConfig()).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet',
      orgSlug: 'acme',
    });
  });

  it('requires the complete frontend-originated capsule for a Bearer request', async () => {
    await expect(
      controller.converse(
        {} as never,
        'Bearer valid-token',
        {
          userMessage: 'hello',
          conversationId: 'server-must-not-create-it',
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(agent.process).not.toHaveBeenCalled();
  });

  it('answers a guest session the server no longer accepts with 401, so the widget starts a new one', async () => {
    sessions.verifySessionToken.mockReturnValue(null);
    await expect(
      controller.converse({} as never, 'GuestSession expired-token', { userMessage: 'hello' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(agent.process).not.toHaveBeenCalled();
  });

  it('rejects a context whose user does not match the Bearer principal', async () => {
    await expect(
      controller.converse({} as never, 'Bearer valid-token', {
        userMessage: 'hello',
        context: createMockExecutionContext({ userId: 'other-user' }),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('passes a valid context whole to the customer-service agent', async () => {
    const context = Object.freeze(
      createMockExecutionContext({
        userId: 'user-1',
        agentSlug: 'customer-service',
        agentType: 'langgraph',
      }),
    );

    await controller.converse({} as never, 'Bearer valid-token', {
      userMessage: 'hello',
      context,
    });

    expect(agent.process).toHaveBeenCalledWith(
      expect.objectContaining({ context, userMessage: 'hello' }),
    );
  });
});
