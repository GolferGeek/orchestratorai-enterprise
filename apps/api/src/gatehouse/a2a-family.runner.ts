import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ExecutionContext, InvokeData, InvokeOutput, JsonValue } from '@orchestrator-ai/transport-types';
import { InvokeDispatchService, type FamilyRunner } from '../agents/invoke/invoke-dispatch.service';
import type { A2ATarget, AgentDefinition } from '../agents/invoke/agent-definition.types';
import { AmbientEventsService } from '../ambient/events/ambient-events.service';
import { createSystemTriggeredContext } from '../ambient/automation-context/automation-context';
import { WorkflowRunLauncher } from '../workflows/invoke/workflow-run-launcher.service';
import type { EventOrigin } from '../ambient/event-bus/ambient-event.types';
import { PartnerCallsService } from './partner-calls.service';
import { GatehouseReplyService } from './reply.service';
import type { A2APart } from './a2a-v1';

/**
 * Runs agents of family 'a2a'. A call to an A2A agent fires its target:
 * - ambient: push the named event and answer "received" (any real answer comes
 *   later, from ambient)
 * - agent: invoke an internal agent and return its answer
 * - workflow: queue a run and answer with its id
 * - a2a: send the message to a remote A2A v1.0 agent through the Gatehouse and
 *   return what it answered
 *
 * Invoked with metadata.a2aReply (by an ambient trigger), the agent instead
 * replies to the Gatehouse caller whose request came in on it.
 *
 * Work an A2A agent starts inside the platform runs as the system user in the
 * agent's org (createSystemTriggeredContext, the sanctioned exception shared
 * with ambient), with a fresh conversation; who asked is kept in metadata.
 */
export const MAXIMUM_A2A_HOPS = 3;

@Injectable()
export class A2AFamilyRunner implements FamilyRunner {
  constructor(
    private readonly partners: PartnerCallsService,
    private readonly events: AmbientEventsService,
    private readonly dispatch: InvokeDispatchService,
    private readonly launcher: WorkflowRunLauncher,
    private readonly replies: GatehouseReplyService,
  ) {}

  async invoke(
    definition: AgentDefinition,
    context: ExecutionContext,
    data: InvokeData,
    metadata?: Record<string, unknown>,
  ): Promise<InvokeOutput> {
    if (!definition.a2a) throw new Error(`A2A agent ${definition.slug} has no target`);
    if (metadata?.a2aReply !== undefined) {
      const sent = await this.replies.send(definition, context.orgSlug, eventOrigin(metadata.a2aReply), replyParts(definition.slug, data));
      return { content: { status: 'sent', ...sent }, outputType: 'json', metadata: { a2a: { target: 'reply', to: sent.caller } } };
    }
    const { target } = definition.a2a;
    const parts = messageParts(definition.slug, data);

    if (target.kind === 'agent') {
      const hops = typeof metadata?.a2aHops === 'number' ? metadata.a2aHops + 1 : 1;
      if (hops > MAXIMUM_A2A_HOPS) {
        throw new Error(`A2A agent ${definition.slug}: more than ${MAXIMUM_A2A_HOPS} A2A agents in a row; refusing a possible loop`);
      }
      const started = systemContextFor(context, target.agentSlug);
      const output = await this.dispatch.invoke(started, data, {
        source: 'a2a',
        via: definition.slug,
        // Whoever called this A2A agent: a Gatehouse caller, or a person.
        requestedBy: metadata?.caller ?? { userId: context.userId, conversationId: context.conversationId },
        a2aHops: hops,
      });
      return {
        ...output,
        metadata: { ...(output.metadata ?? {}), a2a: { target: 'agent', agent: target.agentSlug, conversationId: started.conversationId } },
      };
    }

    if (target.kind === 'workflow') {
      const started = systemContextFor(context, target.workflowSlug);
      const entry = await this.launcher.runtimeEntry(target.workflowSlug, context.orgSlug);
      const launched = entry.ok
        ? await this.launcher.launch(entry.value, {
            context: started,
            input: workflowInput(definition.slug, target, parts),
            accessControl: { mode: 'org' },
            queuedMessage: `Run queued by A2A agent "${definition.slug}"`,
          })
        : entry;
      if (!launched.ok) throw new Error(`A2A agent ${definition.slug} could not start ${target.workflowSlug}: ${launched.message}`);
      return {
        content: { status: 'queued', workflow: target.workflowSlug, runId: launched.value.id },
        outputType: 'json',
        metadata: { a2a: { target: 'workflow', workflow: target.workflowSlug, runId: launched.value.id } },
      };
    }

    if (target.kind === 'ambient') {
      const origin = gatehouseOrigin(definition.slug, metadata);
      const { event, duplicate } = await this.events.push(context.orgSlug, {
        name: target.event,
        payload: eventPayload(parts),
        source: `a2a:${definition.slug}`,
        ...(origin ? { origin } : {}),
      });
      return {
        content: { status: 'received', eventId: event.id, event: event.name, duplicate },
        outputType: 'json',
        metadata: { a2a: { target: 'ambient', eventId: event.id } },
      };
    }

    const answer = await this.partners.forward(definition, context.orgSlug, parts);
    return {
      ...replyOutput(answer.parts, answer.partner),
      metadata: {
        a2a: {
          target: 'a2a',
          agent: answer.partner,
          state: 'completed',
          ...(answer.taskId ? { taskId: answer.taskId } : {}),
          ...(answer.contextId ? { contextId: answer.contextId } : {}),
        },
      },
    };
  }
}

/**
 * The work an A2A agent starts belongs to the system user in the agent's org,
 * on a new conversation; the model is the one the call came with.
 */
function systemContextFor(context: ExecutionContext, agentSlug: string): ExecutionContext {
  return createSystemTriggeredContext({
    orgSlug: context.orgSlug,
    agentSlug,
    provider: context.provider,
    model: context.model,
    conversationId: randomUUID(),
  });
}

/**
 * A workflow's start input from an A2A message: the target's fixed input, the
 * message's data (an object), and its text in `textField`. Text with nowhere
 * to go, or data that is not an object, fails rather than being dropped.
 */
export function workflowInput(
  slug: string,
  target: Extract<A2ATarget, { kind: 'workflow' }>,
  parts: A2APart[],
): JsonValue {
  const input: Record<string, unknown> = { ...(target.input ?? {}) };
  for (const part of parts) {
    if ('text' in part) {
      if (!target.textField) throw new Error(`A2A agent ${slug} takes data for ${target.workflowSlug}, not text`);
      input[target.textField] = input[target.textField] === undefined ? part.text : `${String(input[target.textField])}\n\n${part.text}`;
    } else if ('url' in part) {
      throw new Error(`A2A agent ${slug} cannot pass files to ${target.workflowSlug} yet`);
    } else {
      if (typeof part.data !== 'object' || part.data === null || Array.isArray(part.data)) {
        throw new Error(`A2A agent ${slug}: the data for ${target.workflowSlug} must be an object`);
      }
      Object.assign(input, part.data);
    }
  }
  return input as JsonValue;
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
    channel: 'a2a',
    ...(texts.length > 0 ? { message: texts.join('\n\n') } : {}),
    ...(data.length === 1 ? { data: data[0] } : data.length > 1 ? { data } : {}),
  };
}

/**
 * Text parts read as text; a single data part is its JSON; a single image or
 * video file is its URL; anything else is the parts.
 */
export function replyOutput(parts: A2APart[], agentName: string): Pick<InvokeOutput, 'content' | 'outputType'> {
  if (parts.length === 0) throw new Error(`${agentName} answered with nothing`);
  if (parts.every((part) => 'text' in part)) {
    return { content: parts.map((part) => (part as { text: string }).text).join('\n\n'), outputType: 'text' };
  }
  const only = parts.length === 1 ? parts[0]! : undefined;
  if (only && 'data' in only) return { content: only.data, outputType: 'json' };
  if (only && 'url' in only) {
    const kind = only.mediaType?.split('/')[0];
    if (kind === 'image' || kind === 'video') return { content: only.url, outputType: kind };
  }
  return { content: { parts }, outputType: 'json' };
}

/** A Gatehouse call's origin, so a trigger can reply through this agent; none for any other caller. */
function gatehouseOrigin(via: string, metadata: Record<string, unknown> | undefined): EventOrigin | undefined {
  if (metadata?.source !== 'gatehouse') return undefined;
  const caller = metadata.caller as { id?: unknown } | undefined;
  const task = metadata.a2aTask as { id?: unknown; contextId?: unknown } | undefined;
  if (typeof caller?.id !== 'string' || typeof task?.id !== 'string' || typeof task.contextId !== 'string') {
    throw new Error(`A2A agent ${via}: a Gatehouse call must carry its caller and task`);
  }
  return { via, callerId: caller.id, contextId: task.contextId, taskId: task.id };
}

function eventOrigin(raw: unknown): EventOrigin {
  const origin = raw as Partial<EventOrigin> | null;
  if (!origin || [origin.via, origin.callerId, origin.contextId, origin.taskId].some((value) => typeof value !== 'string')) {
    throw new Error('metadata.a2aReply must be an event origin {via, callerId, contextId, taskId}');
  }
  return origin as EventOrigin;
}

/** A reply's content: { parts } already in A2A form (text, data or a url). */
function replyParts(slug: string, data: InvokeData): A2APart[] {
  const parts = (data.content as { parts?: unknown } | null)?.parts;
  if (!Array.isArray(parts) || parts.length === 0) throw new Error(`A2A agent ${slug}: a reply needs parts`);
  return parts.map((part, index) => {
    const value = part as Record<string, unknown>;
    if (typeof value?.text === 'string') return { text: value.text };
    if (value && 'data' in value) return typeof value.mediaType === 'string' ? { data: value.data, mediaType: value.mediaType } : { data: value.data };
    if (typeof value?.url === 'string') {
      return {
        url: value.url,
        ...(typeof value.mediaType === 'string' ? { mediaType: value.mediaType } : {}),
        ...(typeof value.filename === 'string' ? { filename: value.filename } : {}),
      };
    }
    throw new Error(`A2A agent ${slug}: reply part ${index} is neither text, data nor a url`);
  });
}
