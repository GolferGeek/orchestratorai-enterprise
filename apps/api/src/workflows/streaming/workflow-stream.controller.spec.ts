import { BadRequestException } from '@nestjs/common';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { Subject } from 'rxjs';

jest.mock('../../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {},
}));

import { WorkflowStreamController } from './workflow-stream.controller';

describe('WorkflowStreamController scope', () => {
  const subject = new Subject<Record<string, unknown>>();
  const events = {
    getSnapshot: jest.fn(),
    events$: subject.asObservable(),
  };
  const tokens = { issueToken: jest.fn() };
  let controller: WorkflowStreamController;

  beforeEach(() => {
    jest.clearAllMocks();
    events.getSnapshot.mockReturnValue([]);
    controller = new WorkflowStreamController(events as never, tokens as never);
  });

  it('issues a short-lived token only for a matching frontend context', () => {
    const context = createMockExecutionContext({
      orgSlug: 'acme',
      userId: 'user-1',
      agentSlug: 'marketing-swarm',
      agentType: 'workflow',
    });
    tokens.issueToken.mockReturnValue({
      token: 'stream-token',
      expiresAt: new Date('2026-08-06T12:00:00.000Z'),
    });

    const result = controller.issueStreamToken(
      { context },
      { id: 'user-1' } as never,
      { organizationSlug: 'acme' },
    );

    expect(tokens.issueToken).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: context.conversationId,
        conversationId: context.conversationId,
        organizationSlug: 'acme',
      }),
    );
    expect(result.token).toBe('stream-token');
  });

  it('rejects a stream token request for another tenant', () => {
    const context = createMockExecutionContext({
      orgSlug: 'other-org',
      userId: 'user-1',
      agentSlug: 'marketing-swarm',
      agentType: 'workflow',
    });

    expect(() =>
      controller.issueStreamToken({ context }, { id: 'user-1' } as never, {
        organizationSlug: 'acme',
      }),
    ).toThrow(BadRequestException);
    expect(tokens.issueToken).not.toHaveBeenCalled();
  });
});
