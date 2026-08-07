import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Response } from 'express';

/**
 * SseService — Platform-standard SSE streaming for Secure Conversations.
 *
 * Secure Conversations emits SSE events for:
 * - Inbound A2A request received
 * - Inbound A2A request validated / rejected
 * - Outbound A2A request sent
 * - External agent status changes (registered, deregistered, heartbeat)
 * - Security violations (rate limit, signature failure)
 *
 * SSE format matches the platform standard used by Workflows and Ambient:
 *   Content-Type: text/event-stream
 *   Cache-Control: no-cache
 *   Connection: keep-alive
 *   data: {...}\n\n
 */

export interface SecureConversationsEvent {
  organizationSlug: string;
  type:
    | 'inbound.received'
    | 'inbound.validated'
    | 'inbound.rejected'
    | 'inbound.forwarded'
    | 'outbound.sent'
    | 'outbound.responded'
    | 'agent.registered'
    | 'agent.deregistered'
    | 'agent.heartbeat'
    | 'security.violation'
    | 'heartbeat';
  timestamp: string;
  agentId?: string;
  method?: string;
  requestId?: string;
  success?: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class SseService implements OnModuleDestroy {
  private readonly logger = new Logger(SseService.name);
  private readonly connectedClients = new Map<Response, string>();
  private readonly heartbeatTimer: NodeJS.Timeout;

  constructor() {
    // Start heartbeat
    this.heartbeatTimer = setInterval(() => {
      for (const [client, organizationSlug] of this.connectedClients) {
        this.writeEvent(client, {
          organizationSlug,
          type: 'heartbeat',
          timestamp: new Date().toISOString(),
        });
      }
    }, 10000);
    this.heartbeatTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.heartbeatTimer);
    for (const client of this.connectedClients.keys()) {
      client.end();
    }
    this.connectedClients.clear();
  }

  /**
   * Emit a Secure Conversations event only to clients in the same authorized
   * organization.
   */
  emit(event: SecureConversationsEvent): void {
    const deadClients: Response[] = [];

    for (const [client, organizationSlug] of this.connectedClients) {
      if (organizationSlug !== event.organizationSlug) {
        continue;
      }
      try {
        this.writeEvent(client, event);
      } catch {
        deadClients.push(client);
      }
    }

    // Clean up dead connections
    for (const dead of deadClients) {
      this.connectedClients.delete(dead);
    }
  }

  /**
   * Register an SSE client response stream.
   * Sends an initial connection event and adds to the active set.
   */
  addClient(res: Response, organizationSlug: string): void {
    // Platform-standard SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    this.connectedClients.set(res, organizationSlug);
    this.logger.log(
      `SSE client connected for ${organizationSlug}. Organization total: ${this.getClientCount(organizationSlug)}`,
    );

    // Send connection event
    const connectEvent: SecureConversationsEvent = {
      organizationSlug,
      type: 'heartbeat',
      timestamp: new Date().toISOString(),
      message: 'Secure Conversations SSE stream connected',
      data: { clients: this.getClientCount(organizationSlug) },
    };
    this.writeEvent(res, connectEvent);

    // Clean up on disconnect
    res.on('close', () => {
      this.connectedClients.delete(res);
      this.logger.log(
        `SSE client disconnected from ${organizationSlug}. Organization total: ${this.getClientCount(organizationSlug)}`,
      );
    });
  }

  getClientCount(organizationSlug?: string): number {
    if (!organizationSlug) {
      return this.connectedClients.size;
    }
    return Array.from(this.connectedClients.values()).filter(
      (candidate) => candidate === organizationSlug,
    ).length;
  }

  private writeEvent(
    client: Response,
    event: SecureConversationsEvent,
  ): void {
    if (!client.writableEnded) {
      client.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }
}
