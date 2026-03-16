import { Injectable } from '@nestjs/common';
import { AgentRuntimeDefinition } from '../interfaces/agent.interface';
import { TaskRequestDto } from '@agent2agent/dto/task-request.dto';

export type RuntimePromptMode = 'converse' | 'build' | 'plan';

export interface PromptBuildOptions {
  definition: AgentRuntimeDefinition;
  request: TaskRequestDto;
  mode?: RuntimePromptMode;
  additionalMetadata?: Record<string, unknown>;
}

export interface PromptPayload {
  systemPrompt: string;
  userMessage: string;
  metadata: Record<string, unknown>;
  optionMetadata: Record<string, unknown>;
  conversationId?: string;
  sessionId?: string;
  userId: string | null;
}

@Injectable()
export class AgentRuntimePromptService {
  buildPromptPayload(options: PromptBuildOptions): PromptPayload {
    const mode = options.mode ?? 'converse';
    const systemPrompt = this.buildSystemPrompt(options.definition, mode);
    const userMessage = this.buildUserMessage(
      options.definition,
      options.request,
      mode,
    );
    const metadata = this.collectMetadata(
      options.definition,
      options.request,
      options.additionalMetadata,
    );

    const payload = options.request.payload ?? {};
    const payloadOptions = payload.options as
      | Record<string, unknown>
      | undefined;
    const payloadMetadata =
      (payloadOptions?.metadata as Record<string, unknown> | undefined) ?? {};
    const optionMetadata: Record<string, unknown> = {
      ...payloadMetadata,
      ...metadata,
    };

    return {
      systemPrompt,
      userMessage,
      metadata,
      optionMetadata,
      conversationId: options.request.context?.conversationId,
      sessionId: options.request.context?.taskId,
      userId: this.resolveUserId(options.request, metadata),
    };
  }

  buildSystemPrompt(
    definition: AgentRuntimeDefinition,
    mode: RuntimePromptMode = 'converse',
  ): string {
    const promptCandidate =
      definition.prompts.system ??
      definition.context?.system_prompt ??
      definition.context?.systemPrompt ??
      definition.config?.system_prompt ??
      definition.config?.systemPrompt ??
      definition.description;

    const fallbackName = definition.name ?? definition.slug;
    let basePrompt = '';

    if (typeof promptCandidate === 'string' && promptCandidate.trim()) {
      basePrompt = promptCandidate;
    } else {
      // Fallback prompts by mode
      if (mode === 'build') {
        basePrompt = [
          `You are ${fallbackName}.`,
          'Produce an actionable deliverable that fulfills the build request.',
          'Follow organizational policies and any provided requirements/instructions.',
          'Be concise but complete; include structure/sections when appropriate.',
          'Avoid speculative content; clearly state assumptions if needed.',
        ].join(' ');
      } else if (mode === 'plan') {
        basePrompt = [
          `You are ${fallbackName}.`,
          'Create a comprehensive plan for the requested task.',
          'Follow organizational policies and any provided requirements/instructions.',
          'Be thorough and structured; include all relevant planning elements.',
        ].join(' ');
      } else {
        // converse (default)
        basePrompt = [
          `You are ${fallbackName}.`,
          'Respond helpfully and keep replies brief.',
          'Avoid long documents or outlines; no multi-section markdown.',
          'Prefer a short answer and ask one clarifying question when useful.',
          'Follow organizational policies at all times.',
        ].join(' ');
      }
    }

    // Inject plan template for plan mode
    if (mode === 'plan') {
      const planTemplate = definition.context?.plan_template;
      if (typeof planTemplate === 'string' && planTemplate.trim()) {
        const finalPrompt = `${basePrompt}\n\n${planTemplate}`;
        return finalPrompt;
      }
    }

    return basePrompt;
  }

  buildUserMessage(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    mode: RuntimePromptMode = 'converse',
  ): string {
    const payload = request.payload ?? {};
    const pieces: string[] = [];

    const promptPrefix =
      (definition.config?.prompt_prefix as string | undefined) ?? null;
    if (promptPrefix && promptPrefix.trim()) {
      pieces.push(promptPrefix.trim());
    }

    const conversationHistory = this.buildConversationHistory(request.messages);
    if (conversationHistory) {
      pieces.push(`Recent conversation history:\n${conversationHistory}`);
    }

    if (typeof request.userMessage === 'string' && request.userMessage.trim()) {
      pieces.push(request.userMessage.trim());
    }

    if (typeof payload.prompt === 'string' && payload.prompt.trim()) {
      pieces.push(payload.prompt.trim());
    }

    if (mode === 'build' && payload.instructions) {
      pieces.push(`Instructions: ${this.stringify(payload.instructions)}`);
    }

    if (Array.isArray(payload.requirements) && payload.requirements.length) {
      pieces.push(`Requirements: ${this.stringify(payload.requirements)}`);
    }

    if (!pieces.length) {
      return mode === 'build'
        ? 'Generate the requested build deliverable.'
        : 'Respond to the user in a helpful manner.';
    }

    return pieces.join('\n\n');
  }

  collectMetadata(
    definition: AgentRuntimeDefinition,
    request: TaskRequestDto,
    additional: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    const baseMetadata = {
      agentId: definition.slug, // Use slug as ID in v2
      agentSlug: definition.slug,
      agentType: definition.agentType,
      modeProfile: definition.execution.modeProfile,
      organizationSlug: definition.organizationSlug,
    };

    return {
      ...baseMetadata,
      ...(request.payload?.metadata ?? {}),
      ...(request.metadata ?? {}),
      ...(additional ?? {}),
    };
  }

  mapComplexity(
    score: number | null | undefined,
  ): 'simple' | 'medium' | 'complex' | undefined {
    if (score === undefined || score === null || Number.isNaN(score)) {
      return undefined;
    }
    if (score < 0.3) {
      return 'simple';
    }
    if (score < 0.7) {
      return 'medium';
    }
    return 'complex';
  }

  private resolveUserId(
    request: TaskRequestDto,
    metadata: Record<string, unknown>,
  ): string | null {
    const payload = request.payload ?? {};
    return (
      (metadata.userId as string | undefined) ??
      (payload.userId as string | undefined) ??
      null
    );
  }

  private buildConversationHistory(
    messages: TaskRequestDto['messages'],
  ): string | null {
    if (!Array.isArray(messages) || !messages.length) {
      return null;
    }

    const recent = messages.slice(-6);
    return recent
      .map((message) => {
        const role = message.role ?? 'user';
        const content = this.stringify(message.content ?? '');
        return `[${role}] ${content}`;
      })
      .join('\n');
  }

  private stringify(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}
