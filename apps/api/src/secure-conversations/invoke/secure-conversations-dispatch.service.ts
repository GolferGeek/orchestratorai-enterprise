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
import { randomUUID } from 'crypto';
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

@Injectable()
export class SecureConversationsDispatchService {
  private readonly logger = new Logger(SecureConversationsDispatchService.name);

  constructor(
    @Inject(OBSERVABILITY_SERVICE)
    private readonly observability: ObservabilityServiceProvider,
    private readonly router: A2ARouterService,
    private readonly registry: ExternalRegistryService,
    private readonly db: SecureConversationsDatabaseService,
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
    const direction = (metadata?.direction as string) || 'inbound';

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
    const method = (metadata?.method as string) ?? 'invoke';
    const externalAgentId = metadata?.externalAgentId as string | undefined;

    const messageId = await this.db.logMessage({
      org_slug: context.orgSlug,
      direction: 'inbound',
      external_agent_id: externalAgentId ?? 'unknown',
      method,
      request_payload: data.content as unknown,
      status: 'pending',
      created_at: new Date().toISOString(),
    });

    // Resolve the internal routing target
    const params = typeof data.content === 'object' && data.content !== null
      ? (data.content as Record<string, unknown>)
      : { payload: data.content };

    const target = this.router.resolveRoute(method, params, externalAgentId);

    const internalRequest = {
      jsonrpc: '2.0',
      id: context.conversationId ?? randomUUID(),
      method: 'invoke',
      params: {
        context,
        data,
        metadata: {
          ...metadata,
          secureConversationsForwarded: true,
          secureConversationsMessageId: messageId,
          originalMethod: method,
        },
      },
    };

    this.logger.log(`Dispatching inbound to unified ${target.product} module`);
    const jsonResponse = (await this.router.forwardRequest(
      target,
      internalRequest,
      externalAgentId,
    )) as {
      result?: { output?: InvokeOutput };
      error?: { message?: string };
    };

    if (jsonResponse.error) {
      await this.safeUpdateMessageStatus(messageId, 'error');
      throw new Error(jsonResponse.error.message ?? 'Internal agent returned error');
    }

    const output: InvokeOutput = jsonResponse.result?.output ?? {
      content: jsonResponse,
      outputType: 'json',
    };

    await this.safeUpdateMessageStatus(messageId, 'success', output);

    // Track successful interaction with the external agent
    if (externalAgentId) {
      await this.registry.incrementInteractions(externalAgentId, true);
    }

    return output;
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

    const agent = await this.registry.getAgent(targetAgentId);

    const messageId = await this.db.logMessage({
      org_slug: context.orgSlug,
      direction: 'outbound',
      external_agent_id: targetAgentId,
      method: 'invoke',
      request_payload: data.content as unknown,
      status: 'pending',
      created_at: new Date().toISOString(),
    });

    const outboundUrl = agent.url.replace(/\/$/, '') + '/invoke';
    this.logger.log(`Dispatching outbound to external agent ${targetAgentId} at ${outboundUrl}`);

    const outboundRequest = {
      jsonrpc: '2.0',
      id: context.conversationId ?? randomUUID(),
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

    const response = await fetch(outboundUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'OrchestratorAI-Secure-Conversations/0.1.0',
      },
      body: JSON.stringify(outboundRequest),
    });

    if (!response.ok) {
      const statusText = await this.safeReadText(response);
      await this.safeUpdateMessageStatus(messageId, 'error');
      await this.registry.incrementInteractions(targetAgentId, false);
      throw new Error(
        `External agent ${targetAgentId} returned HTTP ${response.status}: ${statusText}`,
      );
    }

    const jsonResponse = (await response.json()) as {
      result?: { output?: InvokeOutput };
      error?: { message?: string };
    };

    if (jsonResponse.error) {
      await this.safeUpdateMessageStatus(messageId, 'error');
      await this.registry.incrementInteractions(targetAgentId, false);
      throw new Error(jsonResponse.error.message ?? 'External agent returned error');
    }

    const output: InvokeOutput = jsonResponse.result?.output ?? {
      content: jsonResponse,
      outputType: 'json',
    };

    await this.safeUpdateMessageStatus(messageId, 'success', output);
    await this.registry.incrementInteractions(targetAgentId, true);

    return output;
  }

  private async safeReadText(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return '';
    }
  }

  private async safeUpdateMessageStatus(
    messageId: string,
    status: string,
    output?: InvokeOutput,
  ): Promise<void> {
    await this.db.updateMessageStatus(messageId, status, output);
  }
}
