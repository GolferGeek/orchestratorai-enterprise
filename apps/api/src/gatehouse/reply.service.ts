import { Inject, Injectable } from '@nestjs/common';
import { CONFIG_PROVIDER_SERVICE, type ConfigProvider } from '@orchestratorai/planes/config';
import type { AgentDefinition } from '../agents/invoke/agent-definition.types';
import type { EventOrigin } from '../ambient/event-bus/ambient-event.types';
import { A2AClientService } from './a2a-client.service';
import type { A2APart } from './a2a-v1';
import { CallersRepository } from './callers.repository';
import { gatehouseBaseUrl } from './callers.controller';
import { GatehouseKeysService } from './gatehouse-keys.service';

/** A reply we will not send: the caller is gone, suspended, or no longer admitted. */
export class ReplyRefused extends Error {}

export interface ReplySent {
  caller: string;
  state: string;
  taskId?: string;
}

/**
 * A reply to a Gatehouse caller, sent by the A2A agent its request came in on.
 * The call is signed as that agent with our key (iss = its card, jku = our JWK
 * set) and continues the caller's conversation (contextId), naming the task it
 * answers. The agent's caller policy is checked again at reply time.
 */
@Injectable()
export class GatehouseReplyService {
  constructor(
    private readonly callers: CallersRepository,
    private readonly client: A2AClientService,
    private readonly keys: GatehouseKeysService,
    @Inject(CONFIG_PROVIDER_SERVICE) private readonly config: ConfigProvider,
  ) {}

  async send(via: AgentDefinition, orgSlug: string, origin: EventOrigin, parts: A2APart[]): Promise<ReplySent> {
    if (origin.via !== via.slug) {
      throw new ReplyRefused(`A reply goes through the agent the request came in on (${origin.via}), not ${via.slug}`);
    }
    const caller = await this.callers.byId(origin.callerId);
    if (!caller) throw new ReplyRefused('The caller is no longer registered');
    if (caller.status !== 'active') throw new ReplyRefused(`${caller.name} is suspended`);
    const policy = via.a2a!.callers;
    if (policy !== 'any' && !policy.allow.includes(caller.cardUrl)) {
      throw new ReplyRefused(`${via.slug} no longer takes calls from ${caller.name}`);
    }

    const base = gatehouseBaseUrl(this.config);
    const { reply } = await this.client.sendMessage({ orgSlug, agentSlug: via.slug, kind: 'reply', callerId: caller.id }, { cardUrl: caller.cardUrl }, parts, {
      signAs: (audience) => this.keys.sign(`${base}/a2a/${via.slug}/.well-known/agent-card.json`, audience, `${base}/gatehouse/jwks.json`),
      contextId: origin.contextId,
      referenceTaskIds: [origin.taskId],
    });
    return { caller: caller.name, state: reply.state, ...(reply.taskId ? { taskId: reply.taskId } : {}) };
  }
}
