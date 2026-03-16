import { Controller, Get } from '@nestjs/common';
import {
  ContextMetricsListener,
  RollupMetrics,
} from './context-metrics.listener';

/**
 * Context Metrics Controller
 *
 * Provides HTTP endpoints for accessing context optimization metrics.
 * Enables monitoring and observability of the context optimization service.
 *
 * Endpoints:
 * - GET /metrics/context/rollup - Returns aggregated metrics
 *
 * @example
 * ```bash
 * curl http://localhost:3000/metrics/context/rollup
 * # Returns:
 * # {
 * #   "events": 500,
 * #   "optimizationRate": 35.2,
 * #   "averageCompressionRatio": 0.73,
 * #   "averageProcessingTimeMs": 145,
 * #   "p50ProcessingTimeMs": 120,
 * #   "p95ProcessingTimeMs": 380
 * # }
 * ```
 */
@Controller('metrics/context')
export class ContextMetricsController {
  constructor(private readonly listener: ContextMetricsListener) {}

  /**
   * Get aggregated rollup metrics for context optimization.
   *
   * Returns metrics calculated from the most recent 1000 optimization events,
   * including optimization rate, compression ratio, and processing time percentiles.
   *
   * @returns Aggregated metrics object
   *
   * @example
   * ```typescript
   * // GET /metrics/context/rollup
   * {
   *   events: 500,
   *   optimizationRate: 35.2,
   *   averageCompressionRatio: 0.73,
   *   averageProcessingTimeMs: 145,
   *   p50ProcessingTimeMs: 120,
   *   p95ProcessingTimeMs: 380
   * }
   * ```
   */
  @Get('rollup')
  getRollup(): RollupMetrics {
    return this.listener.getRollup();
  }
}
