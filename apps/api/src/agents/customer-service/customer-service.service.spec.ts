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
        CUSTOMER_SERVICE_ORG: 'acme',
      };
      return values[key];
    });
    service = new CustomerServiceService(config as never);
  });

  it('exposes the configured provider, model and organization so the frontend can originate context', () => {
    expect(service.getClientContextConfig()).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet',
      orgSlug: 'acme',
    });
  });

  it('throws when CUSTOMER_SERVICE_ORG is not configured', () => {
    const base = config.get.getMockImplementation();
    config.get.mockImplementation((key: string) =>
      key === 'CUSTOMER_SERVICE_ORG' ? undefined : base?.(key),
    );

    expect(() => service.getClientContextConfig()).toThrow(
      'CUSTOMER_SERVICE_ORG is required for guest sessions',
    );
  });

  it('signs and restores the exact frontend-originated guest context', () => {
    const context = createMockExecutionContext({
      orgSlug: 'acme',
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

  it('rejects a guest context for any organization other than CUSTOMER_SERVICE_ORG', () => {
    const otherOrg = createMockExecutionContext({
      orgSlug: 'public',
      userId: 'ec2b337e-bb25-4bc4-8b31-8316eb2d42e4',
      conversationId: '5f64cb08-ea1f-4c13-b965-5b6f19d0ded9',
      agentSlug: 'customer-service',
      agentType: 'langgraph',
      provider: 'anthropic',
      model: 'claude-sonnet',
    });

    expect(() => service.createSession(otherOrg)).toThrow(BadRequestException);
  });

  it('stops accepting a signed session once CUSTOMER_SERVICE_ORG changes', () => {
    const context = createMockExecutionContext({
      orgSlug: 'acme',
      userId: 'ec2b337e-bb25-4bc4-8b31-8316eb2d42e4',
      conversationId: '5f64cb08-ea1f-4c13-b965-5b6f19d0ded9',
      agentSlug: 'customer-service',
      agentType: 'langgraph',
      provider: 'anthropic',
      model: 'claude-sonnet',
    });
    const session = service.createSession(context);
    const base = config.get.getMockImplementation();
    config.get.mockImplementation((key: string) =>
      key === 'CUSTOMER_SERVICE_ORG' ? 'other-co' : base?.(key),
    );

    expect(service.verifySessionToken(session.sessionToken)).toBeNull();
  });

  it('propagates missing signing configuration instead of treating it as an invalid token', () => {
    config.get.mockReturnValue(undefined);

    expect(() => service.verifySessionToken('some-token')).toThrow(
      InternalServerErrorException,
    );
  });
});
