import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';

@Controller('analytics')
export class AnalyticsController {
  /**
   * Minimal event ingest endpoint for frontend analytics.
   * Intentionally no-op in dev; returns success immediately.
   */
  @Post('events')
  @HttpCode(HttpStatus.OK)
  trackEvent(@Body() _event: unknown): { success: boolean } {
    // In development, we don't persist analytics. Avoid noisy errors.
    return { success: true };
  }

  /**
   * Batch ingest endpoint (optional usage by frontend).
   */
  @Post('events/batch')
  @HttpCode(HttpStatus.OK)
  trackEventBatch(@Body() _payload: unknown): { success: boolean } {
    return { success: true };
  }
}
