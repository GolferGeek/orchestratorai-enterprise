import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { StreamingController } from './streaming.controller';

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
  agentSlug: 'ambient',
  agentType: 'ambient',
  provider: 'platform',
  model: 'event-stream',
});

describe('Ambient StreamingController token boundary', () => {
  const streaming = { eventsForOrganization: jest.fn() };
  const streamTokens = { issueToken: jest.fn() };
  let controller: StreamingController;

  beforeEach(() => {
    jest.clearAllMocks();
    streamTokens.issueToken.mockReturnValue({
      token: 'short-lived-token',
      expiresAt: new Date('2026-08-06T13:00:00.000Z'),
    });
    controller = new StreamingController(
      streaming as never,
      streamTokens as never,
    );
  });

  it('issues an Ambient-only token from a complete frontend context', () => {
    const result = controller.issueStreamToken(
      { context },
      user as never,
      { organizationSlug: 'acme' } as never,
    );

    expect(streamTokens.issueToken).toHaveBeenCalledWith({
      user,
      taskId: context.conversationId,
      conversationId: context.conversationId,
      agentSlug: 'ambient',
      organizationSlug: 'acme',
    });
    expect(result).toEqual({
      token: 'short-lived-token',
      expiresAt: '2026-08-06T13:00:00.000Z',
    });
  });

  it.each([
    [{ ...context, userId: 'other-user' }],
    [{ ...context, orgSlug: 'other-org' }],
    [{ ...context, agentSlug: 'secure-conversations' }],
    [{ ...context, taskId: 'not-transport-context' }],
  ])('rejects an invalid context before token issuance', (invalidContext) => {
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
    const request = {
      organizationSlug: 'acme',
      user: { id: 'user-1' },
      streamTokenClaims: {
        sub: 'user-1',
        agentSlug: 'marketing-swarm',
        organizationSlug: 'acme',
      },
    };

    expect(() => controller.stream(request as never, {} as never)).toThrow(
      UnauthorizedException,
    );
  });
});
