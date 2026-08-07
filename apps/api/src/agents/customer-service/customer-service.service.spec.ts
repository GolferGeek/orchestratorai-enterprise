import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { CustomerServiceService } from './customer-service.service';

describe('CustomerServiceService guest context boundary', () => {
  const config = { get: jest.fn() };
  let service: CustomerServiceService;

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        GUEST_SESSION_SECRET:
          'guest-session-secret-with-at-least-thirty-two-bytes',
        DEFAULT_LLM_PROVIDER: 'anthropic',
        DEFAULT_LLM_MODEL: 'claude-sonnet',
      };
      return values[key];
    });
    service = new CustomerServiceService(config as never);
  });

  it('exposes the configured provider and model so the frontend can originate context', () => {
    expect(service.getClientContextConfig()).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet',
    });
  });

  it('signs and restores the exact frontend-originated guest context', () => {
    const context = createMockExecutionContext({
      orgSlug: 'public',
      userId: 'ec2b337e-bb25-4bc4-8b31-8316eb2d42e4',
      conversationId: '5f64cb08-ea1f-4c13-b965-5b6f19d0ded9',
      agentSlug: 'customer-service',
      agentType: 'langgraph',
      provider: 'anthropic',
      model: 'claude-sonnet',
    });

    const session = service.createSession(context);
    const verified = service.verifySessionToken(session.sessionToken);

    expect(session.conversationId).toBe(context.conversationId);
    expect(verified?.executionContext).toEqual(context);
  });

  it('rejects a guest context with a server-selected or spoofed identity field', () => {
    const invalid = createMockExecutionContext({
      orgSlug: 'private-org',
      userId: 'ec2b337e-bb25-4bc4-8b31-8316eb2d42e4',
      conversationId: '5f64cb08-ea1f-4c13-b965-5b6f19d0ded9',
      agentSlug: 'admin-agent',
      agentType: 'context',
      provider: 'openai',
      model: 'other-model',
    });

    expect(() => service.createSession(invalid)).toThrow(BadRequestException);
  });

  it('propagates missing signing configuration instead of treating it as an invalid token', () => {
    config.get.mockReturnValue(undefined);

    expect(() => service.verifySessionToken('some-token')).toThrow(
      InternalServerErrorException,
    );
  });
});
