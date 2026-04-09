import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '@orchestratorai/auth-client';
import { SseService } from './sse.service';

// SSE streaming — uses stream tokens
@Public()
@Controller('stream')
export class SseController {
  constructor(private readonly sse: SseService) {}

  /**
   * SSE endpoint for Bridge event stream.
   * Clients connect and receive real-time events as Bridge processes A2A traffic.
   *
   * GET /stream/events
   */
  @Get('events')
  stream(@Res() res: Response): void {
    this.sse.addClient(res);
    // Response stays open — SSE connection is long-lived
  }

  @Get('status')
  getStatus() {
    return {
      clients: this.sse.getClientCount(),
      timestamp: new Date().toISOString(),
    };
  }
}
