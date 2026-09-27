import { ForbiddenException } from '@nestjs/common';
import { Subject } from 'rxjs';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';

jest.mock('../../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {},
}));

import { ADMIN_STREAM_PURPOSE, ObservabilityStreamController } from './observability-stream.controller';

function event(orgSlug: string, agentSlug = 'exec-digest') {
  return { context: createMockExecutionContext({ orgSlug, agentSlug }), hook_event_type: 'agent.llm.completed' };
}

function setup(snapshot: unknown[] = []) {
  const subject = new Subject<unknown>();
  const events = { getSnapshot: jest.fn(() => snapshot), events$: subject.asObservable() };
  const tokens = {
    issueToken: jest.fn(() => ({ token: 't', expiresAt: new Date('2026-09-27T12:00:00Z') })),
  };
  const controller = new ObservabilityStreamController(events as never, tokens as never);
  const written: unknown[] = [];
  const response = {
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    writableEnded: false,
    write: jest.fn((chunk: string) => {
      if (chunk.startsWith('data: ')) written.push(JSON.parse(chunk.slice(6)));
    }),
    on: jest.fn(),
  };
  return { controller, subject, tokens, response, written };
}

const user = { id: 'admin-1' } as never;
const claims = (org: string, overrides: Record<string, unknown> = {}) => ({
  sub: 'admin-1',
  agentSlug: ADMIN_STREAM_PURPOSE,
  taskId: ADMIN_STREAM_PURPOSE,
  organizationSlug: org,
  ...overrides,
});

describe('Admin observability stream', () => {
  it('issues a token bound to the admin stream, the user and the RBAC org', () => {
    const { controller, tokens } = setup();
    controller.issueStreamToken(user, { organizationSlug: 'corporate' });
    expect(tokens.issueToken).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: ADMIN_STREAM_PURPOSE,
        agentSlug: ADMIN_STREAM_PURPOSE,
        organizationSlug: 'corporate',
      }),
    );
  });

  it("streams only the admin's org, buffered then live", () => {
    const { controller, subject, response, written } = setup([event('corporate'), event('legal')]);
    controller.stream(user, { organizationSlug: 'corporate', streamTokenClaims: claims('corporate') as never }, response as never);
    subject.next(event('corporate', 'decision-risk'));
    subject.next(event('marketing'));
    expect(written.map((e) => (e as { context?: { orgSlug: string } }).context?.orgSlug ?? 'connected')).toEqual([
      'connected',
      'corporate',
      'corporate',
    ]);
    expect(response.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
  });

  it('streams every org for a super-admin with none selected', () => {
    const { controller, response, written } = setup([event('corporate'), event('legal')]);
    controller.stream(user, { organizationSlug: '*', streamTokenClaims: claims('*') as never }, response as never);
    expect(written).toHaveLength(3);
  });

  it.each([
    ['no stream token (a bearer token)', undefined],
    ['a workflow stream token', claims('corporate', { agentSlug: 'exec-digest', taskId: 'conv-1' })],
    ["another user's token", claims('corporate', { sub: 'someone-else' })],
    ['a token for another org', claims('legal')],
  ])('refuses %s', (_label, streamClaims) => {
    const { controller, response } = setup();
    expect(() =>
      controller.stream(user, { organizationSlug: 'corporate', streamTokenClaims: streamClaims as never }, response as never),
    ).toThrow(ForbiddenException);
    expect(response.setHeader).not.toHaveBeenCalled();
  });
});
