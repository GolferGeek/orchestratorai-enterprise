import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SigningService } from '../security/signing.service';

interface JsonRpcRequest<P = unknown> {
  jsonrpc: string;
  method: string;
  id?: string | number | null;
  params?: P;
}
import { ExternalRegistryService } from '../registry/external-registry.service';
import { BridgeDatabaseService } from '../database/bridge-database.service';
import { BridgeProtocolService } from '../protocol/bridge-protocol.service';
import { randomUUID } from 'crypto';

/**
 * A2ASenderService — Sends A2A requests to external agents.
 *
 * Bridge signs all outbound requests with the security envelope
 * before sending them to external agents. The sender:
 * 1. Checks the circuit breaker — blocks the request if the agent is failing
 * 2. Looks up the external agent in the registry
 * 3. Signs the request with Bridge's signing key
 * 4. Logs the outbound message as 'pending'
 * 5. Sends the JSON-RPC 2.0 request to the external agent's endpoint
 * 6. Records the interaction in the registry (trust score update)
 * 7. Updates the circuit breaker state (success/failure)
 * 8. Updates the message log with the outcome
 * 9. Returns the result
 */

/**
 * OutboundRequest — Bridge-internal type for targeting a specific external agent.
 * targetAgentId is a Bridge concept; the wire format is JsonRpcRequest from transport-types.
 */
export interface OutboundRequest {
  targetAgentId: string;
  method: string;
  params: Record<string, unknown>;
}

export interface OutboundResult {
  requestId: string;
  targetAgentId: string;
  targetUrl: string;
  method: string;
  response: unknown;
  durationMs: number;
  success: boolean;
}

@Injectable()
export class A2ASenderService {
  private readonly logger = new Logger(A2ASenderService.name);

  private readonly BRIDGE_AGENT_ID: string;
  private readonly defaultOrgSlug: string;
  private readonly machineIdentity: string;

  constructor(
    private readonly config: ConfigService,
    private readonly signing: SigningService,
    private readonly registry: ExternalRegistryService,
    private readonly db: BridgeDatabaseService,
    private readonly protocol: BridgeProtocolService,
  ) {
    this.BRIDGE_AGENT_ID = this.config.get<string>('BRIDGE_AGENT_ID', 'orchestratorai-bridge');
    this.defaultOrgSlug = this.config.get<string>('DEFAULT_ORG_SLUG', 'default');
    this.machineIdentity = this.config.get<string>('MACHINE_IDENTITY_STRING', '');
  }

  /**
   * Send a JSON-RPC 2.0 request to a registered external agent.
   * Signs the request, checks the circuit breaker, logs the message, and records
   * the interaction outcome in the registry.
   */
  async sendToExternalAgent(request: OutboundRequest): Promise<OutboundResult> {
    const agentId = request.targetAgentId;

    // Check circuit breaker before doing anything else
    if (this.protocol.isCircuitOpen(agentId)) {
      this.logger.warn(
        `Circuit breaker OPEN for agent ${agentId} — request blocked without sending`,
      );

      const requestId = randomUUID();
      const blockedResponse = {
        jsonrpc: '2.0',
        id: requestId,
        error: {
          code: -32000,
          message: `Circuit breaker open for agent ${agentId} — too many recent failures`,
        },
      };

      return {
        requestId,
        targetAgentId: agentId,
        targetUrl: 'blocked',
        method: request.method,
        response: blockedResponse,
        durationMs: 0,
        success: false,
      };
    }

    const agent = await this.registry.getAgent(agentId);
    const requestId = randomUUID();
    const startMs = Date.now();

    const jsonRpcRequest: JsonRpcRequest<Record<string, unknown>> = {
      jsonrpc: '2.0',
      id: requestId,
      method: request.method,
      params: request.params,
    };

    // Sign the request
    const envelope = this.signing.generateEnvelope(this.BRIDGE_AGENT_ID, jsonRpcRequest);

    // Prefer the dedicated A2A endpoint; fall back to the agent's registered url
    const targetUrl = agent.a2aEndpoint ?? agent.url;

    this.logger.log(`Sending ${request.method} to external agent ${agentId} at ${targetUrl}`);

    // Log the outbound message as pending before sending
    let messageLogId: string | null = null;
    try {
      messageLogId = await this.db.logMessage({
        org_slug: this.defaultOrgSlug,
        direction: 'outbound',
        external_agent_id: agentId,
        method: request.method,
        request_id: requestId,
        request_payload: jsonRpcRequest as unknown,
        status: 'pending',
      });
    } catch (logError) {
      this.logger.error(
        `Failed to log outbound message: ${logError instanceof Error ? logError.message : String(logError)}`,
      );
    }

    let success = false;
    let responseData: unknown;

    try {
      const outboundHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Agent-Id': this.BRIDGE_AGENT_ID,
        'X-Security-Envelope': JSON.stringify(envelope),
      };

      if (agent.apiKey) {
        outboundHeaders['Authorization'] = `Bearer ${agent.apiKey}`;
      }

      if (this.machineIdentity) {
        outboundHeaders['X-Machine-Identity'] = this.machineIdentity;
      }

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: outboundHeaders,
        body: JSON.stringify(jsonRpcRequest),
      });

      if (!response.ok) {
        throw new Error(`External agent returned HTTP ${response.status}`);
      }

      responseData = await response.json();
      success = !(responseData as { error?: unknown })?.error;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send to ${agentId}: ${message}`);
      responseData = {
        jsonrpc: '2.0',
        id: requestId,
        error: { code: -32000, message },
      };
    }

    const durationMs = Date.now() - startMs;

    // Update circuit breaker state
    if (success) {
      this.protocol.recordSuccess(agentId);
    } else {
      this.protocol.recordFailure(agentId);
    }

    // Update trust score in registry
    await this.registry.incrementInteractions(agentId, success);

    // Update message log with outcome
    if (messageLogId) {
      try {
        await this.db.updateMessageStatus(
          messageLogId,
          success ? 'success' : 'error',
          responseData,
          durationMs,
        );
      } catch (updateError) {
        this.logger.error(
          `Failed to update outbound message status: ${updateError instanceof Error ? updateError.message : String(updateError)}`,
        );
      }
    }

    return {
      requestId,
      targetAgentId: agentId,
      targetUrl,
      method: request.method,
      response: responseData,
      durationMs,
      success,
    };
  }

  /**
   * Broadcast a request to all registered external agents.
   * Returns results per agent.
   */
  async broadcastToAllAgents(
    method: string,
    params: Record<string, unknown>,
  ): Promise<OutboundResult[]> {
    const agents = await this.registry.getAllAgents();

    if (agents.length === 0) {
      this.logger.warn('No external agents registered for broadcast');
      return [];
    }

    const results = await Promise.allSettled(
      agents.map((agent) =>
        this.sendToExternalAgent({
          targetAgentId: agent.id,
          method,
          params,
        }),
      ),
    );

    return results.map((r) => {
      if (r.status === 'fulfilled') return r.value;
      return {
        requestId: 'failed',
        targetAgentId: 'unknown',
        targetUrl: 'unknown',
        method,
        response: { error: r.reason instanceof Error ? r.reason.message : String(r.reason) },
        durationMs: 0,
        success: false,
      };
    });
  }
}
