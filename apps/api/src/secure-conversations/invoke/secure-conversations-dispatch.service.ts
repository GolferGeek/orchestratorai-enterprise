/**
 * Secure Conversations Dispatch Service
 *
 * Routes invoke requests in Secure Conversations context:
 * - Inbound external → translate to platform invoke contract → route to internal agent
 * - Outbound internal → external → route to registered external agent
 *
 * Secure Conversations-specific external metadata stays in the metadata field,
 * never in the shared ExecutionContext capsule.
 *
 * Wired to:
 * - A2ARouterService (inbound/ module) — routes to Workflows/Agents/Ambient
 * - ExternalRegistryService (registry/ module) — looks up external agent endpoints
 * - SecureConversationsDatabaseService (database/ module) — logs A2A messages for audit
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import type {
  ExecutionContext,
  InvokeData,
  InvokeOutput,
} from '@orchestrator-ai/transport-types';
import {
  OBSERVABILITY_SERVICE,
  type ObservabilityServiceProvider,
} from '@orchestratorai/planes/observability';
import { A2ARouterService } from '../inbound/a2a-router.service';
import { ExternalRegistryService } from '../registry/external-registry.service';
import { SecureConversationsDatabaseService } from '../database/secure-conversations-database.service';
import { OutboundUrlValidatorService } from '../security/outbound-url-validator.service';
import { SigningService } from '../security/signing.service';
import { readBoundedJsonResponse } from '../security/bounded-json-response';

@Injectable()
export class SecureConversationsDispatchService {
  private readonly logger = new Logger(SecureConversationsDispatchService.name);

  constructor(
    @Inject(OBSERVABILITY_SERVICE)
    private readonly observability: ObservabilityServiceProvider,
    private readonly router: A2ARouterService,
    private readonly registry: ExternalRegistryService,
    private readonly db: SecureConversationsDatabaseService,
    private readonly outboundUrlValidator: OutboundUrlValidatorService,
    private readonly signing: SigningService,
  ) {}

  /**
   * Handle an invoke request through Secure Conversations.
   *
   * Direction is determined by metadata.direction:
   * - 'inbound' (default): route external A2A request to an internal agent
   * - 'outbound': route platform request to a registered external agent
   */
  async invoke(
    context: ExecutionContext,
    data: InvokeData,
    metadata?: Record<string, unknown>,
  ): Promise<InvokeOutput> {
    const startTime = Date.now();
    const direction = this.requireDirection(metadata);

    await this.observability.emitInvocationEvent(context, {
      type: 'invocation.started',
      sourceApp: 'secure-conversations',
      message: `Secure Conversations ${direction} processing for ${context.agentSlug}`,
      payload: { direction },
    });

    try {
      let output: InvokeOutput;

      if (direction === 'outbound') {
        output = await this.dispatchOutbound(context, data, metadata);
      } else {
        output = await this.dispatchInbound(context, data, metadata);
      }

      const duration = Date.now() - startTime;
      await this.observability.emitInvocationEvent(context, {
        type: 'invocation.completed',
        sourceApp: 'secure-conversations',
        success: true,
        duration,
        payload: { direction },
      });

      return output;
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.observability.emitInvocationEvent(context, {
        type: 'invocation.failed',
        sourceApp: 'secure-conversations',
        success: false,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Dispatch an inbound external A2A request to an internal product (Workflows/Agents/Ambient).
   *
   * The inbound request already carries an ExecutionContext (either forwarded from the
   * external caller or injected by A2ARouterService). Secure Conversations passes it through whole.
   */
  private async dispatchInbound(
    context: ExecutionContext,
    data: InvokeData,
    metadata?: Record<string, unknown>,
  ): Promise<InvokeOutput> {
    const externalAgentId = metadata?.externalAgentId as string | undefined;
    if (
      typeof externalAgentId !== 'string' ||
      !externalAgentId.trim() ||
      externalAgentId.length > 128
    ) {
      throw new Error(
        'Inbound Secure Conversations invocation requires metadata.externalAgentId',
      );
    }

    const messageId = await this.db.logMessage({
      org_slug: context.orgSlug,
      direction: 'inbound',
      external_agent_id: externalAgentId,
      method: 'invoke',
      request_payload: data.content as unknown,
      status: 'pending',
      created_at: new Date().toISOString(),
    });

    // Resolve the internal routing target
    const target = this.router.resolveRoute('invoke', { context }, externalAgentId);

    const internalRequest = {
      jsonrpc: '2.0',
      id: context.conversationId,
      method: 'invoke',
      params: {
        context,
        data,
        metadata: {
          ...metadata,
          secureConversationsForwarded: true,
          secureConversationsMessageId: messageId,
          originalMethod: 'invoke',
        },
      },
    };

    this.logger.log(`Dispatching inbound to unified ${target.product} module`);
    const jsonResponse = await this.router.forwardRequest(
      target,
      internalRequest,
      externalAgentId,
      context.orgSlug,
    );
    try {
      const output = this.parseInvokeOutput(jsonResponse, context.conversationId);
      await this.safeUpdateMessageStatus(messageId, 'success', output);
      await this.registry.incrementInteractions(
        externalAgentId,
        true,
        context.orgSlug,
      );
      return output;
    } catch (error) {
      await this.safeUpdateMessageStatus(messageId, 'error');
      await this.registry.incrementInteractions(
        externalAgentId,
        false,
        context.orgSlug,
      );
      throw error;
    }
  }

  /**
   * Dispatch an outbound request from the platform to a registered external agent.
   *
   * The external agent is identified by metadata.targetAgentId.
   * Secure Conversations looks up the agent's endpoint from the registry and sends a
   * platform-standard invoke request.
   */
  private async dispatchOutbound(
    context: ExecutionContext,
    data: InvokeData,
    metadata?: Record<string, unknown>,
  ): Promise<InvokeOutput> {
    const targetAgentId = metadata?.targetAgentId as string | undefined;
    if (!targetAgentId) {
      throw new Error('Outbound dispatch requires metadata.targetAgentId');
    }

    const agent = await this.registry.getAgentConnection(
      targetAgentId,
      context.orgSlug,
    );

    const messageId = await this.db.logMessage({
      org_slug: context.orgSlug,
      direction: 'outbound',
      external_agent_id: targetAgentId,
      method: 'invoke',
      request_payload: data.content as unknown,
      status: 'pending',
      created_at: new Date().toISOString(),
    });

    const outboundUrl = (
      await this.outboundUrlValidator.assertSafe(agent.url)
    ).toString();
    this.logger.log(`Dispatching outbound to external agent ${targetAgentId} at ${outboundUrl}`);

    const outboundRequest = {
      jsonrpc: '2.0',
      id: context.conversationId,
      method: 'invoke',
      params: {
        context,
        data,
        metadata: {
          ...metadata,
          sourceProduct: 'secure-conversations',
        },
      },
    };
    const senderId = 'orchestratorai-secure-conversations';
    const securityEnvelope = this.signing.generateEnvelope(
      senderId,
      outboundRequest,
    );

    const response = await fetch(outboundUrl, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'OrchestratorAI-Secure-Conversations/0.1.0',
        'X-Agent-Id': senderId,
        'X-Security-Envelope': JSON.stringify(securityEnvelope),
        ...(agent.apiKey
          ? { Authorization: `Bearer ${agent.apiKey}` }
          : {}),
      },
      body: JSON.stringify(outboundRequest),
    });

    if (!response.ok) {
      const statusText = await this.readBoundedText(response);
      await this.safeUpdateMessageStatus(messageId, 'error');
      await this.registry.incrementInteractions(
        targetAgentId,
        false,
        context.orgSlug,
      );
      throw new Error(
        `External agent ${targetAgentId} returned HTTP ${response.status}: ${statusText}`,
      );
    }

    const jsonResponse = await readBoundedJsonResponse(
      response,
      1_048_576,
      'External agent response',
    );
    let output: InvokeOutput;
    try {
      output = this.parseInvokeOutput(jsonResponse, context.conversationId);
    } catch (error) {
      await this.safeUpdateMessageStatus(messageId, 'error');
      await this.registry.incrementInteractions(
        targetAgentId,
        false,
        context.orgSlug,
      );
      throw error;
    }

    await this.safeUpdateMessageStatus(messageId, 'success', output);
    await this.registry.incrementInteractions(
      targetAgentId,
      true,
      context.orgSlug,
    );

    return output;
  }

  private async readBoundedText(response: Response): Promise<string> {
    return (await response.text()).slice(0, 8_192);
  }

  private async safeUpdateMessageStatus(
    messageId: string,
    status: string,
    output?: InvokeOutput,
  ): Promise<void> {
    await this.db.updateMessageStatus(messageId, status, output);
  }

  private requireDirection(
    metadata: Record<string, unknown> | undefined,
  ): 'inbound' | 'outbound' {
    if (
      !metadata ||
      (metadata.direction !== 'inbound' && metadata.direction !== 'outbound')
    ) {
      throw new Error(
        'Secure Conversations metadata.direction must be inbound or outbound',
      );
    }
    return metadata.direction;
  }

  private parseInvokeOutput(value: unknown, expectedId: string): InvokeOutput {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('External agent returned a malformed invoke response');
    }
    const response = value as Record<string, unknown>;
    if (response.jsonrpc !== '2.0' || response.id !== expectedId) {
      throw new Error('External agent returned a malformed invoke response');
    }
    if (typeof response.error === 'object' && response.error !== null) {
      const message = (response.error as Record<string, unknown>).message;
      throw new Error(
        typeof message === 'string'
          ? message
          : 'External agent returned a malformed invoke error',
      );
    }
    if (
      typeof response.result !== 'object' ||
      response.result === null ||
      Array.isArray(response.result)
    ) {
      throw new Error('External agent returned a malformed invoke response');
    }
    const result = response.result as Record<string, unknown>;
    if (
      result.success !== true ||
      typeof result.output !== 'object' ||
      result.output === null ||
      Array.isArray(result.output)
    ) {
      throw new Error('External agent returned a malformed invoke response');
    }
    const output = result.output as Record<string, unknown>;
    const supportedOutputTypes = new Set([
      'text',
      'markdown',
      'json',
      'image',
      'video',
      'audio',
      'artifact-ref',
    ]);
    if (
      !Object.prototype.hasOwnProperty.call(output, 'content') ||
      typeof output.outputType !== 'string' ||
      !supportedOutputTypes.has(output.outputType) ||
      (output.metadata !== undefined &&
        (typeof output.metadata !== 'object' ||
          output.metadata === null ||
          Array.isArray(output.metadata)))
    ) {
      throw new Error('External agent returned a malformed invoke response');
    }
    return output as unknown as InvokeOutput;
  }
}
