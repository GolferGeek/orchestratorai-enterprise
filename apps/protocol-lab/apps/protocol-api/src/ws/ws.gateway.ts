import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server } from 'ws';
import WebSocket from 'ws';
import { WsService } from './ws.service';

@WebSocketGateway({ path: '/ws/events' })
export class WsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(WsGateway.name);
  private heartbeatInterval: ReturnType<typeof setInterval>;

  constructor(private readonly wsService: WsService) {}

  afterInit(_server: Server): void {
    this.logger.log('WebSocket gateway initialized at /ws/events');

    this.heartbeatInterval = setInterval(() => {
      this.wsService.broadcastHeartbeat();
    }, 5000);
  }

  handleConnection(client: WebSocket): void {
    this.wsService.addClient(client);
  }

  handleDisconnect(client: WebSocket): void {
    this.wsService.removeClient(client);
  }

  onModuleDestroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }
}
