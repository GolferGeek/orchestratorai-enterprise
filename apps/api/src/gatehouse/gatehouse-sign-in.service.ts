import { Inject, Injectable } from '@nestjs/common';
import type { AgentDefinition } from '../agents/invoke/agent-definition.types';
import { AGENT_CREDENTIALS, grantProblem, isAgentKey, type AgentCredentialStore } from './agent-credentials';
import { CallerAuthService, GatehouseAuthError } from './caller-auth.service';
import type { Principal } from './principal';

/**
 * Who is calling into the Gatehouse, the same way on every endpoint (A2A and
 * MCP): a registered caller's signed JWT, or an agent key (issued by staff or
 * through "Log in with <company>").
 */
@Injectable()
export class GatehouseSignInService {
  constructor(
    private readonly callers: CallerAuthService,
    @Inject(AGENT_CREDENTIALS) private readonly credentials: AgentCredentialStore,
  ) {}

  /**
   * Sign a bearer token in at `endpoint`, an endpoint of `orgSlug`. A caller's
   * JWT must be issued for that endpoint; an agent key belongs to one org's
   * customer account and calls only that org. Each counts against its rate limit.
   */
  async signIn(token: string, endpoint: string, orgSlug: string): Promise<Principal> {
    if (!isAgentKey(token)) return { kind: 'caller', caller: await this.callers.verify(token, endpoint) };
    const grant = await this.credentials.resolve(token);
    if (!grant) throw new GatehouseAuthError('unauthenticated', 'Unknown agent key');
    const problem = grantProblem(grant);
    if (problem) throw new GatehouseAuthError('unauthenticated', problem);
    if (grant.orgSlug !== orgSlug) throw new GatehouseAuthError('forbidden', 'This agent key is for another organization');
    if (!(await this.credentials.admitCall(grant))) {
      throw new GatehouseAuthError('rate-limited', `More than ${grant.rateLimitPerMinute} requests a minute`);
    }
    return { kind: 'key', grant };
  }

  /** Whether this principal may call this agent: an agent that names its callers takes only those registered callers. */
  mayCall(principal: Principal, agent: AgentDefinition): void {
    const policy = agent.a2a!.callers;
    if (policy === 'any') return;
    if (principal.kind === 'key') {
      throw new GatehouseAuthError('forbidden', 'This agent takes calls only from the registered callers it names');
    }
    if (!policy.allow.includes(principal.caller.cardUrl)) {
      throw new GatehouseAuthError('forbidden', 'This agent does not take calls from this caller');
    }
  }
}
