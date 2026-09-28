import { Injectable } from '@nestjs/common';
import type { ExecutionContext, InvokeData, InvokeOutput } from '@orchestrator-ai/transport-types';
import type { FamilyRunner } from '../agents/invoke/invoke-dispatch.service';
import type { AgentDefinition } from '../agents/invoke/agent-definition.types';
import { AmbientEventsService } from '../ambient/events/ambient-events.service';
import { A2AClientService } from './a2a-client.service';
import type { A2APart } from './a2a-v1';

/**
 * Runs agents of family 'a2a'. A call to an A2A agent fires its target:
 * - ambient: push the named event and answer "received" (any real answer comes
 *   later, from ambient)
 * - a2a: send the message to a remote A2A v1.0 agent through the Gatehouse and
 *   return what it answered
 */
@Injectable()
export class A2AFamilyRunner implements FamilyRunner {
  constructor(
    private readonly client: A2AClientService,
    private readonly events: AmbientEventsService,
  ) {}

  async invoke(definition: AgentDefinition, context: ExecutionContext, data: InvokeData): Promise<InvokeOutput> {
    if (!definition.a2a) throw new Error(`A2A agent ${definition.slug} has no target`);
    const { target } = definition.a2a;
    const parts = messageParts(definition.slug, data);

    if (target.kind === 'ambient') {
      const { event, duplicate } = await this.events.push(context.orgSlug, {
        name: target.event,
        payload: eventPayload(parts),
        source: `a2a:${definition.slug}`,
      });
      return {
        content: { status: 'received', eventId: event.id, event: event.name, duplicate },
        outputType: 'json',
        metadata: { a2a: { target: 'ambient', eventId: event.id } },
      };
    }

    const { card, reply } = await this.client.sendMessage(`A2A agent ${definition.slug}`, target, parts);
    if (reply.state !== 'completed') {
      const said = reply.parts.filter((part): part is { text: string } => 'text' in part).map((part) => part.text).join(' ');
      const why = reply.state === 'working' || reply.state === 'submitted'
        ? 'it did not finish within the call, and following a task is not supported yet'
        : `it answered ${reply.state}`;
      throw new Error(`${card.name}: ${why}${said ? ` (${said.slice(0, 300)})` : ''}`);
    }
    return {
      ...replyOutput(reply.parts, card.name),
      metadata: {
        a2a: {
          target: 'a2a',
          agent: card.name,
          state: reply.state,
          ...(reply.taskId ? { taskId: reply.taskId } : {}),
          ...(reply.contextId ? { contextId: reply.contextId } : {}),
        },
      },
    };
  }
}

/**
 * The caller's message as A2A parts: its text (a string, or `message`) and
 * any other fields as one data part. Attachments are not sent on yet.
 */
export function messageParts(slug: string, data: InvokeData): A2APart[] {
  const content = data.content;
  if (typeof content === 'string') {
    if (!content.trim()) throw new Error(`A2A agent ${slug} needs a message`);
    return [{ text: content }];
  }
  if (typeof content !== 'object' || content === null || Array.isArray(content)) {
    throw new Error(`A2A agent ${slug} takes a message string or an object`);
  }
  const { message, attachments, ...rest } = content as Record<string, unknown>;
  if (Array.isArray(attachments) && attachments.length > 0) {
    throw new Error(`A2A agent ${slug} cannot send attachments yet`);
  }
  const parts: A2APart[] = [];
  if (typeof message === 'string' && message.trim()) parts.push({ text: message });
  if (Object.keys(rest).length > 0) parts.push({ data: rest, mediaType: 'application/json' });
  if (parts.length === 0) throw new Error(`A2A agent ${slug} needs a message`);
  return parts;
}

function eventPayload(parts: A2APart[]): Record<string, unknown> {
  const texts = parts.filter((part): part is { text: string } => 'text' in part).map((part) => part.text);
  const data = parts.filter((part): part is { data: unknown } => 'data' in part).map((part) => part.data);
  return {
    ...(texts.length > 0 ? { message: texts.join('\n\n') } : {}),
    ...(data.length === 1 ? { data: data[0] } : data.length > 1 ? { data } : {}),
  };
}

/** Text parts read as text; a single data part is its JSON; anything else is the parts. */
export function replyOutput(parts: A2APart[], agentName: string): Pick<InvokeOutput, 'content' | 'outputType'> {
  if (parts.length === 0) throw new Error(`${agentName} answered with nothing`);
  if (parts.every((part) => 'text' in part)) {
    return { content: parts.map((part) => (part as { text: string }).text).join('\n\n'), outputType: 'text' };
  }
  if (parts.length === 1) return { content: (parts[0] as { data: unknown }).data, outputType: 'json' };
  return { content: { parts }, outputType: 'json' };
}
