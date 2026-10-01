import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import { AgentDefinitionService } from '../agents/invoke/agent-definition.service';
import type { AgentDefinition } from '../agents/invoke/agent-definition.types';
import { A2AClientService } from './a2a-client.service';
import type { A2APart } from './a2a-v1';

/** A partner's finished answer. */
export interface PartnerAnswer {
  partner: string;
  parts: A2APart[];
  taskId?: string;
  contextId?: string;
}

/**
 * Calls to the partner behind one of our A2A agents (target 'a2a'): the
 * runner's forward, and a workflow step asking a partner mid-run. Every call
 * goes out through the A2A agent, so it carries the agent's configured
 * credential and lands in the outbound log under that agent.
 */
@Injectable()
export class PartnerCallsService {
  constructor(
    private readonly client: A2AClientService,
    private readonly definitions: AgentDefinitionService,
  ) {}

  /** Whether the run's org has this A2A agent, active and pointed at a partner. */
  async available(context: ExecutionContext, agentSlug: string): Promise<boolean> {
    const definition = await this.definitions.resolve(agentSlug, context.orgSlug);
    return definition?.agentType === 'a2a' && definition.a2a?.target.kind === 'a2a';
  }

  /** Ask the partner behind the run's org's A2A agent `agentSlug`. The run's context is passed whole, never changed. */
  async ask(context: ExecutionContext, agentSlug: string, parts: A2APart[]): Promise<PartnerAnswer> {
    const definition = await this.definitions.resolve(agentSlug, context.orgSlug);
    if (!definition || definition.agentType !== 'a2a') throw new Error(`There is no active A2A agent ${agentSlug} in ${context.orgSlug}`);
    return this.forward(definition, context.orgSlug, parts);
  }

  /** Send to an A2A agent's partner; anything but a completed answer is an error that says why. */
  async forward(definition: AgentDefinition, orgSlug: string, parts: A2APart[]): Promise<PartnerAnswer> {
    const target = definition.a2a?.target;
    if (target?.kind !== 'a2a') throw new Error(`A2A agent ${definition.slug} does not forward to a partner`);
    const outgoing = target.send === 'text' ? parts.filter((part) => 'text' in part) : parts;
    if (outgoing.length === 0) throw new Error(`A2A agent ${definition.slug} sends text only, and the message has none`);
    const { card, reply } = await this.client.sendMessage(
      { orgSlug, agentSlug: definition.slug, kind: 'call' },
      { cardUrl: target.cardUrl, ...(target.auth ? { auth: target.auth } : {}) },
      outgoing,
    );
    if (reply.state !== 'completed') {
      const said = reply.parts.filter((part): part is { text: string } => 'text' in part).map((part) => part.text).join(' ');
      const why = reply.state === 'working' || reply.state === 'submitted'
        ? 'it did not finish within the call, and following a task is not supported yet'
        : `it answered ${reply.state}`;
      throw new Error(`${card.name}: ${why}${said ? ` (${said.slice(0, 300)})` : ''}`);
    }
    return {
      partner: card.name,
      parts: reply.parts,
      ...(reply.taskId ? { taskId: reply.taskId } : {}),
      ...(reply.contextId ? { contextId: reply.contextId } : {}),
    };
  }
}
