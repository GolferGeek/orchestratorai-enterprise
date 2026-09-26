import { createMockExecutionContext } from '@orchestrator-ai/transport-types';
import { canReadRun, toWorkflowRunRecord, toWorkflowRunView } from './workflow-run.types';

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const context = createMockExecutionContext({
    conversationId: '11111111-1111-4111-a111-111111111111',
    agentSlug: 'exec-digest',
    agentType: 'workflow',
  });
  return {
    id: context.conversationId,
    organization_slug: context.orgSlug,
    user_id: context.userId,
    workflow_slug: context.agentSlug,
    execution_context: context,
    status: 'running',
    current_step: null,
    progress: null,
    last_message: null,
    error: null,
    input: { week: '2026-W39' },
    documents: [],
    model_profile: {},
    result: null,
    pending_action: null,
    access_control: { mode: 'org' },
    attempt: 1,
    max_attempts: 2,
    lease_expires_at: new Date('2026-09-26T12:00:00Z'),
    worker_id: 'w',
    queued_at: new Date('2026-09-26T11:59:00Z'),
    started_at: new Date('2026-09-26T11:59:30Z'),
    completed_at: null,
    ...overrides,
  };
}

describe('toWorkflowRunRecord', () => {
  it('maps a valid row and freezes the context', () => {
    const record = toWorkflowRunRecord(row());
    expect(record.workflowSlug).toBe('exec-digest');
    expect(record.status).toBe('running');
    expect(record.queuedAt).toBe('2026-09-26T11:59:00.000Z');
    expect(Object.isFrozen(record.executionContext)).toBe(true);
    expect(record.accessControl).toEqual({ mode: 'org' });
  });

  it('accepts an allowlist with user ids', () => {
    const record = toWorkflowRunRecord(
      row({ access_control: { mode: 'allowlist', userIds: ['u1', 'u2'] } }),
    );
    expect(record.accessControl).toEqual({ mode: 'allowlist', userIds: ['u1', 'u2'] });
  });

  it.each([
    ['a context that is not an ExecutionContext', { execution_context: { orgSlug: 'x' } }, 'ExecutionContext'],
    ['an unknown status', { status: 'processing' }, 'not a run status'],
    ['an allowlist without user ids', { access_control: { mode: 'allowlist' } }, 'access rule'],
    ['a missing queued_at', { queued_at: null }, 'queued_at is missing'],
    ['a non-integer attempt', { attempt: '1' }, 'attempt is not an integer'],
    ['a malformed document list', { documents: [{ ref: 'x' }] }, 'document refs'],
  ])('rejects %s', (_label, overrides, message) => {
    expect(() => toWorkflowRunRecord(row(overrides))).toThrow(message);
  });
});

describe('canReadRun', () => {
  const owner = 'user-owner';
  function run(access: Record<string, unknown>) {
    const context = createMockExecutionContext({
      conversationId: '11111111-1111-4111-a111-111111111111',
      agentSlug: 'exec-digest',
      agentType: 'workflow',
      userId: owner,
      orgSlug: 'finance',
    });
    return toWorkflowRunRecord(
      row({
        user_id: owner,
        organization_slug: 'finance',
        execution_context: context,
        access_control: access,
      }),
    );
  }

  it.each([
    ['the owner, whatever the rule', { mode: 'owner' }, owner, 'finance', true],
    ['an org member of an org-shared run', { mode: 'org' }, 'user-2', 'finance', true],
    ['an org member of an owner-only run', { mode: 'owner' }, 'user-2', 'finance', false],
    ['an allowlisted user', { mode: 'allowlist', userIds: ['user-2'] }, 'user-2', 'finance', true],
    ['a user left off the allowlist', { mode: 'allowlist', userIds: ['user-3'] }, 'user-2', 'finance', false],
    ['the owner from another org', { mode: 'org' }, owner, 'legal', false],
    ['a super-admin with no org selected, on a shared run', { mode: 'org' }, 'admin', '*', true],
  ])('%s', (_label, access, userId, organizationSlug, expected) => {
    expect(canReadRun(run(access), { userId, organizationSlug })).toBe(expected);
  });
});

describe('toWorkflowRunView', () => {
  it('leaves out lease and worker internals', () => {
    const view = toWorkflowRunView(toWorkflowRunRecord(row()), null);
    expect(view).not.toHaveProperty('workerId');
    expect(view).not.toHaveProperty('leaseExpiresAt');
    expect(view.runId).toBe('11111111-1111-4111-a111-111111111111');
  });
});
