import { Controller, Get, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { StreamingService } from './streaming.service';

/**
 * SSE streaming endpoint.
 *
 * Platform-standard SSE format:
 *   Content-Type: text/event-stream
 *   Cache-Control: no-cache
 *   Connection: keep-alive
 *   data: <JSON>\n\n
 *
 * This matches the format used by Forge API and Bridge.
 */
// SSE streaming — uses stream tokens for auth, not Bearer JWT. See StreamTokenService.
@Public()
@Controller('streaming')
export class StreamingController {
  private readonly logger = new Logger(StreamingController.name);

  constructor(private readonly streamingService: StreamingService) {}

  @Get('events')
  stream(@Res() res: Response): void {
    // Platform-standard SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

    // Subscribe to events and forward to client
    const subscription = this.streamingService.events$.subscribe({
      next: (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      },
      error: (err: Error) => {
        this.logger.error(`Streaming error: ${err.message}`);
        res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
        res.end();
      },
    });

    // Heartbeat every 30 seconds to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(
        `data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`,
      );
    }, 30000);

    // Clean up on client disconnect
    res.on('close', () => {
      clearInterval(heartbeat);
      subscription.unsubscribe();
      this.logger.debug('SSE client disconnected');
    });
  }
}
