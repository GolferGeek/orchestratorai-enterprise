import { agentKeyMetadata, type AgentGrant } from './agent-credentials';
import type { Caller } from './callers.repository';

/**
 * Who is calling a published A2A agent: a registered caller (an agent that
 * signs each request with its own key), or an agent key (a grant acting for
 * one of the company's customer accounts). Every route treats them the same:
 * the same tasks, the same answers. Only a registered caller can also be
 * called back, because only it has an agent card to reach.
 */
export type Principal = { kind: 'caller'; caller: Caller } | { kind: 'key'; grant: AgentGrant };

/** Who owns a task: exactly one of the two. */
export type TaskOwner = { callerId: string; grantRef: null } | { callerId: null; grantRef: string };

export function ownerOf(principal: Principal): TaskOwner {
  return principal.kind === 'caller'
    ? { callerId: principal.caller.id, grantRef: null }
    : { callerId: null, grantRef: principal.grant.id };
}

export function principalName(principal: Principal): string {
  return principal.kind === 'caller' ? principal.caller.name : `${principal.grant.agentName} (for ${principal.grant.accountLabel})`;
}

/** What the work a call starts is told about who asked. */
export function principalMetadata(principal: Principal): Record<string, unknown> {
  return principal.kind === 'caller'
    ? { caller: { id: principal.caller.id, name: principal.caller.name, cardUrl: principal.caller.cardUrl } }
    : { agentKey: agentKeyMetadata(principal.grant) };
}
