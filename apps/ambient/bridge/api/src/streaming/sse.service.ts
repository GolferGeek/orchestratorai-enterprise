import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import { Response } from 'express';

/**
 * SseService — Platform-standard SSE streaming for Bridge.
 *
 * Bridge emits SSE events for:
 * - Inbound A2A request received
 * - Inbound A2A request validated / rejected
 * - Outbound A2A request sent
 * - External agent status changes (registered, deregistered, heartbeat)
 * - Security violations (rate limit, signature failure)
 *
 * SSE format matches the platform standard used by Forge API and Pulse:
 *   Content-Type: text/event-stream
 *   Cache-Control: no-cache
 *   Connection: keep-alive
 *   data: {...}\n\n
 */

export interface BridgeEvent {
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
export class SseService {
  private readonly logger = new Logger(SseService.name);
  private readonly events$ = new Subject<BridgeEvent>();
  private readonly connectedClients: Set<Response> = new Set();

  constructor() {
    // Start heartbeat
    setInterval(() => {
      this.emit({
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
        data: { clients: this.connectedClients.size },
      });
    }, 10000);
  }

  /**
   * Emit a Bridge event to all connected SSE clients.
   */
  emit(event: BridgeEvent): void {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    const deadClients: Response[] = [];

    for (const client of this.connectedClients) {
      try {
        client.write(payload);
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
  addClient(res: Response): void {
    // Platform-standard SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    this.connectedClients.add(res);
    this.logger.log(`SSE client connected. Total: ${this.connectedClients.size}`);

    // Send connection event
    const connectEvent: BridgeEvent = {
      type: 'heartbeat',
      timestamp: new Date().toISOString(),
      message: 'Bridge SSE stream connected',
      data: { clients: this.connectedClients.size },
    };
    res.write(`data: ${JSON.stringify(connectEvent)}\n\n`);

    // Clean up on disconnect
    res.on('close', () => {
      this.connectedClients.delete(res);
      this.logger.log(`SSE client disconnected. Total: ${this.connectedClients.size}`);
    });
  }

  getClientCount(): number {
    return this.connectedClients.size;
  }
}
