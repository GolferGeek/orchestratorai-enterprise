import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { A2ASenderService, OutboundRequest } from './a2a-sender.service';

@Controller('a2a')
export class A2ASenderController {
  constructor(private readonly sender: A2ASenderService) {}

  @Post('send')
  @HttpCode(200)
  async sendToExternalAgent(@Body() body: OutboundRequest) {
    return this.sender.sendToExternalAgent(body);
  }

  @Post('broadcast')
  @HttpCode(200)
  async broadcastToAllAgents(
    @Body() body: { method: string; params: Record<string, unknown> },
  ) {
    return this.sender.broadcastToAllAgents(body.method, body.params);
  }
}
