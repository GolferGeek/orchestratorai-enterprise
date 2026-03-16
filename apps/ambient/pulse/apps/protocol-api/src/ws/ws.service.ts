import { Injectable, Logger } from '@nestjs/common';
import WebSocket from 'ws';
import { WebSocketEvent } from '@agent-communication/shared-types';

@Injectable()
export class WsService {
  private readonly logger = new Logger(WsService.name);
  private clients: Set<WebSocket> = new Set();

  addClient(client: WebSocket): void {
    this.clients.add(client);
    this.logger.log(`Client connected. Total clients: ${this.clients.size}`);
  }

  removeClient(client: WebSocket): void {
    this.clients.delete(client);
    this.logger.log(`Client disconnected. Total clients: ${this.clients.size}`);
  }

  broadcast(event: WebSocketEvent): void {
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  broadcastMessage(data: Record<string, unknown>): void {
    this.broadcast({
      type: 'message',
      timestamp: new Date().toISOString(),
      data,
    });
  }

  broadcastAgentStatus(data: Record<string, unknown>): void {
    this.broadcast({
      type: 'agent-status',
      timestamp: new Date().toISOString(),
      data,
    });
  }

  broadcastProtocolChange(data: Record<string, unknown>): void {
    this.broadcast({
      type: 'protocol-change',
      timestamp: new Date().toISOString(),
      data,
    });
  }

  broadcastHeartbeat(): void {
    this.broadcast({
      type: 'heartbeat',
      timestamp: new Date().toISOString(),
      data: { clients: this.clients.size },
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }
}
