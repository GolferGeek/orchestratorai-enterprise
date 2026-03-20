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
  ) {}

  /**
   * Register a family runner.
   */
  registerRunner(family: string, runner: FamilyRunner): void {
    this.runners.set(family, runner);
    this.logger.log(`Registered family runner: ${family}`);
  }

  /**
   * Ensure a conversation record exists in the database.
   * Upserts so it's safe to call on every invocation.
   */
  private async ensureConversation(context: ExecutionContext): Promise<void> {
    const { conversationId, userId, agentSlug, agentType, orgSlug } = context;
    const now = new Date().toISOString();

    const { error } = await this.db
      .from(null, 'conversations')
      .upsert({
        id: conversationId,
        user_id: userId,
        agent_name: agentSlug,
        agent_type: agentType,
        organization_slug: orgSlug,
        started_at: now,
        last_active_at: now,
      }, { onConflict: 'id' });

    if (error) {
      this.logger.warn(`Failed to ensure conversation: ${JSON.stringify(error)}`);
    }
  }

  /**
   * Persist the user message and assistant response to conversation_messages.
   * Also updates last_active_at on the conversation.
   * Errors here must NOT propagate — the caller logs them as warnings.
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
          : JSON.stringify(data.content);

    // Derive attachment metadata (filenames + mimeTypes only — no base64)
    const rawAttachments = (data.content as Record<string, unknown>)?.attachments;
    const attachmentsMeta =
      Array.isArray(rawAttachments) && rawAttachments.length > 0
        ? rawAttachments.map((a: unknown) => {
            const att = a as Record<string, unknown>;
            return { filename: att.filename, mimeType: att.mimeType };
          })
        : null;

    const userInsert = await this.db
      .from(null, 'conversation_messages')
      .insert({
        conversation_id: context.conversationId,
        role: 'user',
        content: userContent,
        output_type: 'text',
        attachments: attachmentsMeta ? JSON.stringify(attachmentsMeta) : null,
      });

    if (userInsert.error) {
      throw new Error(`User message insert failed: ${JSON.stringify(userInsert.error)}`);
    }

    // Derive assistant content string
    const assistantContent =
      typeof output.content === 'string'
        ? output.content
        : JSON.stringify(output.content);

    const assistantInsert = await this.db
      .from(null, 'conversation_messages')
      .insert({
        conversation_id: context.conversationId,
        role: 'assistant',
        content: assistantContent,
        output_type: output.outputType ?? 'text',
        metadata: JSON.stringify(output.metadata ?? {}),
      });

    if (assistantInsert.error) {
      throw new Error(
        `Assistant message insert failed: ${JSON.stringify(assistantInsert.error)}`,
      );
    }

    // Update conversation's last_active_at
    const updateResult = await this.db
      .from(null, 'conversations')
      .update({ last_active_at: now })
      .eq('id', context.conversationId);

    if (updateResult.error) {
      throw new Error(
        `Conversation update failed: ${JSON.stringify(updateResult.error)}`,
      );
    }
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

    // Ensure conversation record exists before running
    await this.ensureConversation(context);

    // Emit started
    await this.observability.emitInvocationEvent(context, {
      type: 'invocation.started',
      sourceApp: 'compose',
      message: `Invoking ${context.agentSlug}`,
    });

    try {
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

      // Persist messages as a side effect — do not let persistence failures break the response
      this.persistMessages(context, data, output).catch((err) => {
        this.logger.warn(
          `Failed to persist messages for conversation ${context.conversationId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

      // Emit completed
      const duration = Date.now() - startTime;
      await this.observability.emitInvocationEvent(context, {
        type: 'invocation.completed',
        sourceApp: 'compose',
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
        sourceApp: 'compose',
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
    await this.ensureConversation(context);

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
      // Fallback: run synchronous and send as single output event
      const output = await runner.invoke(definition, context, data, metadata);
      const outputEvent = JSON.stringify({
        event: 'output',
        requestId,
        context,
        data: { outputType: output.outputType, content: output.content },
        timestamp: new Date().toISOString(),
      });
      res.write(`event: output\ndata: ${outputEvent}\n\n`);

      const completedEvent = JSON.stringify({
        event: 'completed',
        requestId,
        context,
        timestamp: new Date().toISOString(),
      });
      res.write(`event: completed\ndata: ${completedEvent}\n\n`);
      res.end();
      return;
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
