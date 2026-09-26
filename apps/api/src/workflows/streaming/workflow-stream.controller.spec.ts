import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { Subject } from 'rxjs';

jest.mock('../../auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {},
}));

import { WorkflowRegistry } from '../catalog/workflow.registry';
import { WorkflowStreamController } from './workflow-stream.controller';

const runId = '11111111-1111-4111-a111-111111111111';

function event(userId: string, conversationId = runId, agentSlug = 'exec-digest') {
  return {
    context: createMockExecutionContext({ orgSlug: 'acme', userId, conversationId, agentSlug }),
    hook_event_type: 'workflow.progress',
  };
}

describe('WorkflowStreamController', () => {
  const subject = new Subject<Record<string, unknown>>();
  const events = {
    getSnapshot: jest.fn(),
    getConversationEvents: jest.fn(),
    events$: subject.asObservable(),
  };
  const tokens = { issueToken: jest.fn() };
  const runs = { getReadable: jest.fn() };
  let controller: WorkflowStreamController;

  beforeEach(() => {
    jest.clearAllMocks();
    events.getSnapshot.mockReturnValue([]);
    runs.getReadable.mockResolvedValue(null);
    tokens.issueToken.mockReturnValue({
      token: 'stream-token',
      expiresAt: new Date('2026-08-06T12:00:00.000Z'),
    });
    const registry = new WorkflowRegistry();
    registry.register({
      slug: 'marketing-swarm',
      name: 'Marketing Swarm',
      organizationSlugs: ['acme'],
      entryPoint: { kind: 'custom', invoke: jest.fn(), runs: null },
    });
    registry.register({
      slug: 'exec-digest',
      name: 'Executive Digest',
      organizationSlugs: ['acme'],
      entryPoint: {
        kind: 'runtime',
        maxAttempts: 1,
        modelRoles: [],
        accessControl: { mode: 'org' },
        parseStartInput: (input) => input,
        runTitle: () => 'digest',
      },
    });
    controller = new WorkflowStreamController(
      events as never,
      tokens as never,
      registry,
      runs as never,
    );
  });

  function context(overrides: Record<string, string> = {}) {
    return createMockExecutionContext({
      orgSlug: 'acme',
      userId: 'user-1',
      conversationId: runId,
      agentSlug: 'exec-digest',
      agentType: 'workflow',
      ...overrides,
    });
  }

  describe('stream tokens', () => {
    it.each(['marketing-swarm', 'exec-digest'])(
      'issues a token for the caller’s own %s conversation',
      async (agentSlug) => {
        const ctx = context({ agentSlug });
        const result = await controller.issueStreamToken(
          { context: ctx },
          { id: 'user-1' } as never,
          { organizationSlug: 'acme' },
        );
        expect(tokens.issueToken).toHaveBeenCalledWith(
          expect.objectContaining({ agentSlug, conversationId: runId, organizationSlug: 'acme' }),
        );
        expect(result.token).toBe('stream-token');
      },
    );

    it('rejects another tenant, an unregistered workflow, and a non-workflow type', async () => {
      for (const ctx of [
        context({ orgSlug: 'other-org' }),
        context({ agentSlug: 'unknown' }),
        context({ agentType: 'context' }),
      ]) {
        await expect(
          controller.issueStreamToken({ context: ctx }, { id: 'user-1' } as never, {
            organizationSlug: 'acme',
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(tokens.issueToken).not.toHaveBeenCalled();
    });

    it('lets a reader of a shared runtime run stream it', async () => {
      runs.getReadable.mockResolvedValue({ id: runId, userId: 'owner', workflowSlug: 'exec-digest' });
      await controller.issueStreamToken(
        { context: context({ userId: 'owner' }) },
        { id: 'user-2' } as never,
        { organizationSlug: 'acme' },
      );
      expect(runs.getReadable).toHaveBeenCalledWith(runId, {
        userId: 'user-2',
        organizationSlug: 'acme',
      });
      expect(tokens.issueToken).toHaveBeenCalled();
    });

    it('refuses someone else’s conversation the caller may not read', async () => {
      await expect(
        controller.issueStreamToken(
          { context: context({ userId: 'owner' }) },
          { id: 'user-2' } as never,
          { organizationSlug: 'acme' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        controller.issueStreamToken(
          { context: context({ userId: 'owner', agentSlug: 'marketing-swarm' }) },
          { id: 'user-2' } as never,
          { organizationSlug: 'acme' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tokens.issueToken).not.toHaveBeenCalled();
    });
  });

  describe('run event history', () => {
    it('returns only the run owner’s events of that conversation', async () => {
      runs.getReadable.mockResolvedValue({
        id: runId,
        userId: 'owner',
        organizationSlug: 'acme',
        workflowSlug: 'exec-digest',
      });
      const own = event('owner');
      events.getConversationEvents.mockResolvedValue([own, event('intruder')]);

      const result = await controller.runEvents('exec-digest', runId, { id: 'user-2' } as never, {
        organizationSlug: 'acme',
      });

      expect(events.getConversationEvents).toHaveBeenCalledWith(runId, 5000);
      expect(result.events).toEqual([own]);
    });

    it('404s a run the reader may not see and a non-runtime workflow', async () => {
      await expect(
        controller.runEvents('exec-digest', runId, { id: 'user-2' } as never, {
          organizationSlug: 'acme',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        controller.runEvents('marketing-swarm', runId, { id: 'user-1' } as never, {
          organizationSlug: 'acme',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(runs.getReadable).toHaveBeenCalledTimes(1);
    });
  });
});
