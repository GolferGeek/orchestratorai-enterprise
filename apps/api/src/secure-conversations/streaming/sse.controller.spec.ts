import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { SseController } from './sse.controller';

const user = {
  id: 'user-1',
  email: 'user@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  appMetadata: {},
  userMetadata: {},
  identities: [],
};

const context = Object.freeze({
  orgSlug: 'acme',
  userId: 'user-1',
  conversationId: '10000000-0000-4000-8000-000000000001',
  agentSlug: 'secure-conversations',
  agentType: 'secure-conversations',
  provider: 'platform',
  model: 'event-stream',
});

describe('Secure Conversations SseController token boundary', () => {
  const sse = { addClient: jest.fn(), getClientCount: jest.fn() };
  const streamTokens = { issueToken: jest.fn() };
  let controller: SseController;

  beforeEach(() => {
    jest.clearAllMocks();
    streamTokens.issueToken.mockReturnValue({
      token: 'short-lived-token',
      expiresAt: new Date('2026-08-06T13:00:00.000Z'),
    });
    controller = new SseController(sse as never, streamTokens as never);
  });

  it('issues a product-bound token from a complete frontend context', () => {
    expect(
      controller.issueStreamToken(
        { context },
        user as never,
        { organizationSlug: 'acme' } as never,
      ),
    ).toEqual({
      token: 'short-lived-token',
      expiresAt: '2026-08-06T13:00:00.000Z',
    });
    expect(streamTokens.issueToken).toHaveBeenCalledWith({
      user,
      taskId: context.conversationId,
      conversationId: context.conversationId,
      agentSlug: 'secure-conversations',
      organizationSlug: 'acme',
    });
  });

  it.each([
    [{ ...context, userId: 'other-user' }],
    [{ ...context, orgSlug: 'other-org' }],
    [{ ...context, agentSlug: 'ambient' }],
    [{ ...context, taskId: 'not-transport-context' }],
  ])('rejects invalid context before token issuance', (invalidContext) => {
    expect(() =>
      controller.issueStreamToken(
        { context: invalidContext },
        user as never,
        { organizationSlug: 'acme' } as never,
      ),
    ).toThrow(BadRequestException);
    expect(streamTokens.issueToken).not.toHaveBeenCalled();
  });

  it('rejects a stream token issued for another product', () => {
    expect(() =>
      controller.stream(
        {
          organizationSlug: 'acme',
          user: { id: 'user-1' },
          streamTokenClaims: {
            sub: 'user-1',
            agentSlug: 'ambient',
            organizationSlug: 'acme',
          },
        } as never,
        {} as never,
      ),
    ).toThrow(UnauthorizedException);
    expect(sse.addClient).not.toHaveBeenCalled();
  });
});
