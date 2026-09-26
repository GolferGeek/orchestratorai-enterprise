/**
 * Invoke Dispatch Service
 *
 * Routes invocations to the correct agent family runner.
 *
 * Flow:
 * 1. Resolve agent definition from agentSlug
 * 2. Identify the agent family (context, rag, api, external, media)
 * 3. Dispatch to the family runner
 * 4. Return typed output
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import type {
  ExecutionContext,
  InvokeData,
  InvokeOutput,
  DatabaseService,
} from '@orchestrator-ai/transport-types';
import { DATABASE_SERVICE } from '@orchestrator-ai/transport-types';
import {
  OBSERVABILITY_SERVICE,
  type ObservabilityServiceProvider,
} from '@orchestratorai/planes/observability';
import { AgentDefinitionService } from './agent-definition.service';
import { ConversationOwnershipService } from '../../common/conversations/conversation-ownership.service';
import type { AgentDefinition } from './agent-definition.types';
import type { Response } from 'express';

/**
 * Family runner interface — the v2 replacement for IAgentRunner.
 * Single-action, typed output, no mode routing.
 */
export interface FamilyRunner {
  invoke(
    definition: AgentDefinition,
    context: ExecutionContext,
    data: InvokeData,
    metadata?: Record<string, unknown>,
  ): Promise<InvokeOutput>;

  invokeStream?(
    definition: AgentDefinition,
    context: ExecutionContext,
    data: InvokeData,
    metadata: Record<string, unknown> | undefined,
    requestId: string | number | null,
    res: Response,
  ): Promise<void>;
}

@Injectable()
export class InvokeDispatchService {
  private readonly logger = new Logger(InvokeDispatchService.name);
  private readonly runners = new Map<string, FamilyRunner>();

  constructor(
    private readonly agentDefs: AgentDefinitionService,
    @Inject(OBSERVABILITY_SERVICE)
    private readonly observability: ObservabilityServiceProvider,
    @Inject(DATABASE_SERVICE)
    private readonly db: DatabaseService,
    private readonly conversationOwnership: ConversationOwnershipService,
  ) {}

  /**
   * Register a family runner.
   */
  registerRunner(family: string, runner: FamilyRunner): void {
    this.runners.set(family, runner);
    this.logger.log(`Registered family runner: ${family}`);
  }

  /** Ensure the client-originated conversation id cannot cross ownership. */
  /**
   * Persist the user message and assistant response to conversation_messages.
   * Also updates last_active_at on the conversation.
   * Persistence is part of invocation success and therefore fails closed.
   */
  private async persistMessages(
    context: ExecutionContext,
    data: InvokeData,
    output: InvokeOutput,
  ): Promise<void> {
    const now = new Date().toISOString();

    // Derive user content string
    const userContent =
      typeof data.content === 'string'
        ? data.content
        : typeof (data.content as Record<string, unknown>)?.message === 'string'
          ? ((data.content as Record<string, unknown>).message as string)
          : this.serializeContent(data.content, 'user content');

    // Derive attachment metadata (filenames + mimeTypes only — no base64)
    const rawAttachments = (data.content as Record<string, unknown>)
      ?.attachments;
    const attachmentsMeta =
      Array.isArray(rawAttachments) && rawAttachments.length > 0
        ? rawAttachments.map((a: unknown) => {
            const att = a as Record<string, unknown>;
            return { filename: att.filename, mimeType: att.mimeType };
          })
        : null;

    const assistantContent = this.serializeContent(
      output.content,
      'assistant output',
    );
    const assistantMessage: Record<string, unknown> = {
      conversation_id: context.conversationId,
      role: 'assistant',
      content: assistantContent,
      output_type: output.outputType,
    };
    if (output.metadata !== undefined) {
      assistantMessage.metadata = output.metadata;
    }

    const messageInsert = await this.db
      .from(null, 'conversation_messages')
      .insert([
        {
        conversation_id: context.conversationId,
        role: 'user',
        content: userContent,
        output_type: 'text',
          attachments: attachmentsMeta,
        },
        assistantMessage,
      ]);

    if (messageInsert.error) {
      throw new Error(
        `Conversation message insert failed: ${messageInsert.error.message}`,
      );
    }

    // Update conversation's last_active_at
    const updateResult = await this.db
      .from(null, 'conversations')
      .update({
        last_active_at: now,
        last_output_type: output.outputType,
      })
      .eq('id', context.conversationId)
      .eq('user_id', context.userId)
      .eq('organization_slug', context.orgSlug);

    if (updateResult.error) {
      throw new Error(
        `Conversation update failed: ${updateResult.error.message}`,
      );
    }
  }

  private serializeContent(value: unknown, description: string): string {
    if (typeof value === 'string') {
      return value;
    }
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new Error(`${description} cannot be serialized`);
    }
    return serialized;
  }

  /**
   * Synchronous invocation.
   */
  async invoke(
    context: ExecutionContext,
    data: InvokeData,
    metadata?: Record<string, unknown>,
  ): Promise<InvokeOutput> {
    const startTime = Date.now();

    try {
      await this.conversationOwnership.ensure(context);

      await this.observability.emitInvocationEvent(context, {
        type: 'invocation.started',
        sourceApp: 'agents',
        message: `Invoking ${context.agentSlug}`,
      });

      // Resolve agent definition
      const definition = await this.agentDefs.resolve(
        context.agentSlug,
        context.orgSlug,
      );

      if (!definition) {
        throw new Error(`Agent not found: ${context.agentSlug}`);
      }

      // Get family runner
      const runner = this.runners.get(definition.agentType);
      if (!runner) {
        throw new Error(`No runner for agent family: ${definition.agentType}`);
      }

      // Execute
      const output = await runner.invoke(definition, context, data, metadata);

      await this.persistMessages(context, data, output);

      // Emit completed
      const duration = Date.now() - startTime;
      await this.observability.emitInvocationEvent(context, {
        type: 'invocation.completed',
        sourceApp: 'agents',
        success: true,
        duration,
        message: `Completed ${context.agentSlug} in ${duration}ms`,
      });

      return output;
    } catch (error) {
      // Emit failed
      const duration = Date.now() - startTime;
      await this.observability.emitInvocationEvent(context, {
        type: 'invocation.failed',
        sourceApp: 'agents',
        success: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Streaming invocation.
   */
  async invokeStream(
    context: ExecutionContext,
    data: InvokeData,
    metadata: Record<string, unknown> | undefined,
    requestId: string | number | null,
    res: Response,
  ): Promise<void> {
    await this.conversationOwnership.ensure(context);

    const definition = await this.agentDefs.resolve(
      context.agentSlug,
      context.orgSlug,
    );

    if (!definition) {
      throw new Error(`Agent not found: ${context.agentSlug}`);
    }

    const runner = this.runners.get(definition.agentType);
    if (!runner) {
      throw new Error(`No runner for agent family: ${definition.agentType}`);
    }

    if (!runner.invokeStream) {
      throw new Error(
        `Agent family ${definition.agentType} does not support streaming`,
      );
    }

    await runner.invokeStream(
      definition,
      context,
      data,
      metadata,
      requestId,
      res,
    );
  }
}
