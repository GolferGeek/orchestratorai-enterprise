import { Injectable } from '@nestjs/common';
import { CentralizedRoutingService } from '@llm/centralized-routing.service';
import { TaskRequestDto } from '../dto/task-request.dto';
import { AgentRecord } from '@agent-platform/interfaces/agent.interface';

export interface RoutingAssessment {
  showstopper: boolean;
  humanMessage?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class RoutingPolicyAdapterService {
  constructor(private readonly routingService: CentralizedRoutingService) {}

  async evaluate(
    request: TaskRequestDto,
    agent: AgentRecord,
  ): Promise<RoutingAssessment> {
    const prompt = this.buildPrompt(request, agent);
    const options = this.buildRoutingOptions(request, agent);

    const decision = await this.routingService.determineRoute(prompt, options);

    if (decision.routeToAgent === false) {
      return {
        showstopper: true,
        humanMessage:
          decision.blockingReason ?? 'Routing policy requires human review.',
        metadata: decision as unknown as Record<string, unknown>,
      };
    }

    return {
      showstopper: false,
      metadata: decision as unknown as Record<string, unknown>,
    };
  }

  private buildPrompt(request: TaskRequestDto, agent: AgentRecord): string {
    const segments: string[] = [];

    if (typeof request.userMessage === 'string' && request.userMessage.trim()) {
      segments.push(`User message: ${request.userMessage.trim()}`);
    }

    const payload = request.payload ?? {};

    if (Array.isArray(request.messages) && request.messages.length) {
      const recent = request.messages.slice(-6);
      const transcript = recent
        .map((msg) => {
          const content = this.stringifyObject(msg.content ?? '');
          return `[${msg.role}] ${content}`;
        })
        .join('\n');
      segments.push(`Recent transcript:\n${transcript}`);
    }

    if (typeof payload.summary === 'string' && payload.summary.trim()) {
      segments.push(`Summary: ${payload.summary.trim()}`);
    }

    if (payload.planDraft) {
      segments.push(
        `Plan draft snippet: ${this.stringifyObject(payload.planDraft)}`,
      );
    }

    if (payload.orchestration) {
      segments.push(
        `Orchestration payload snippet: ${this.stringifyObject(payload.orchestration)}`,
      );
    }

    if (request.promptParameters) {
      segments.push(
        `Prompt parameters: ${this.stringifyObject(request.promptParameters)}`,
      );
    }

    if (!segments.length) {
      segments.push(
        `Mode ${request.mode!} request for agent ${agent.slug} (conversation ${request.context?.conversationId ?? 'unknown'}, task ${request.context?.taskId ?? 'n/a'})`,
      );
    }

    return segments.join('\n\n');
  }

  private buildRoutingOptions(
    request: TaskRequestDto,
    agent: AgentRecord,
  ): Record<string, unknown> {
    const payload = request.payload ?? {};
    const metadata = this.collectMetadata(request);
    const context = request.context;

    return {
      mode: request.mode!,
      agentSlug: agent.slug,
      conversationId: context?.conversationId,
      taskId: context?.taskId,
      planId: context?.planId,
      organizationSlug: agent.organization_slug ?? null,
      userId:
        context?.userId ??
        ((metadata.userId ?? payload.userId ?? null) as string | null),
      requestId: (metadata.requestId ?? payload.requestId ?? null) as
        | string
        | null,
      providerName: (context?.provider ??
        metadata.providerName ??
        payload.providerName ??
        null) as string | null,
      provider: (context?.provider ??
        metadata.provider ??
        payload.provider ??
        null) as string | null,
      modelName: (context?.model ??
        metadata.modelName ??
        payload.modelName ??
        null) as string | null,
      model: (context?.model ?? metadata.model ?? payload.model ?? null) as
        | string
        | null,
      metadata,
      promptInputs: request.promptParameters ?? {},
    };
  }

  private stringifyObject(value: unknown): string {
    try {
      return JSON.stringify(value).slice(0, 4000);
    } catch {
      return String(value);
    }
  }

  private collectMetadata(request: TaskRequestDto): Record<string, unknown> {
    return {
      ...(request.payload?.metadata ?? {}),
      ...(request.metadata ?? {}),
    };
  }
}
