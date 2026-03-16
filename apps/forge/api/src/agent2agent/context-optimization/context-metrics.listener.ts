import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

/**
 * Event emitted after context optimization completes.
 * Contains metrics about the optimization operation.
 */
export interface ContextMetricsEvent {
  /** Number of messages in original conversation */
  originalCount: number;
  /** Number of messages after optimization */
  optimizedCount: number;
  /** Time taken to perform optimization in milliseconds */
  processingTimeMs: number;
  /** Optional type of work product involved in optimization */
  workProductType?: 'deliverable';
}

/**
 * Aggregated metrics calculated from a buffer of context optimization events.
 * Provides insights into optimization performance and effectiveness.
 */
export interface RollupMetrics {
  /** Total number of optimization events in buffer */
  events: number;
  /** Percentage of requests that resulted in optimization (0-100) */
  optimizationRate: number;
  /** Average ratio of optimized/original message counts (0-1, lower = more compression) */
  averageCompressionRatio: number;
  /** Average time to complete optimization in milliseconds */
  averageProcessingTimeMs: number;
  /** Median (50th percentile) processing time in milliseconds */
  p50ProcessingTimeMs: number;
  /** 95th percentile processing time in milliseconds */
  p95ProcessingTimeMs: number;
}

/**
 * Context Metrics Listener
 *
 * Listens for 'context_optimization.metrics' events and maintains a rolling
 * buffer of the most recent 1000 events. Calculates aggregated metrics
 * including optimization rate, compression ratio, and processing time percentiles.
 *
 * This service enables monitoring of context optimization performance without
 * requiring persistent storage.
 *
 * @example
 * ```typescript
 * // Get current rollup metrics
 * const metrics = listener.getRollup();
 * console.log(`Optimization rate: ${metrics.optimizationRate}%`);
 * console.log(`P95 processing time: ${metrics.p95ProcessingTimeMs}ms`);
 * ```
 */
@Injectable()
export class ContextMetricsListener {
  private readonly logger = new Logger(ContextMetricsListener.name);
  private readonly bufferSize = 1000;
  private readonly events: ContextMetricsEvent[] = [];

  constructor() {}

  /**
   * Event handler for context optimization metrics.
   *
   * Maintains a rolling buffer of the most recent 1000 events.
   * When buffer is full, oldest events are discarded (FIFO).
   *
   * @param event - Context optimization metrics event
   *
   * Note: WebSocket broadcast is deprecated - we now use SSE streaming.
   * This method only logs and buffers events for rollup metrics.
   */
  @OnEvent('context_optimization.metrics')
  handleMetrics(event: ContextMetricsEvent) {
    this.events.push(event);
    if (this.events.length > this.bufferSize) this.events.shift();

    // WebSocket broadcast is deprecated - we now use SSE streaming
    // This metric tracking is kept but not broadcast
    this.logger.debug(
      `Context optimization metrics: ${event.originalCount} → ${event.optimizedCount}`,
    );
  }

  /**
   * Calculates aggregated rollup metrics from buffered events.
   *
   * Metrics Calculated:
   * - events: Total count of buffered events
   * - optimizationRate: % of events where messages were reduced
   * - averageCompressionRatio: Average of (optimized / original) counts
   * - averageProcessingTimeMs: Mean processing time
   * - p50ProcessingTimeMs: Median processing time
   * - p95ProcessingTimeMs: 95th percentile processing time
   *
   * @returns Aggregated metrics object
   *
   * Edge Cases:
   * - Empty buffer: Returns metrics with 1 event to avoid division by zero
   * - Single event: Percentiles use that event's time
   * - Zero original count: Compression ratio defaults to 1 (no compression)
   *
   * Time Complexity: O(n log n) due to sorting for percentile calculation
   * Space Complexity: O(n) for sorted times array
   *
   * @example
   * ```typescript
   * const rollup = getRollup();
   * // {
   * //   events: 500,
   * //   optimizationRate: 35.2,
   * //   averageCompressionRatio: 0.73,
   * //   averageProcessingTimeMs: 145,
   * //   p50ProcessingTimeMs: 120,
   * //   p95ProcessingTimeMs: 380
   * // }
   * ```
   */
  getRollup(): RollupMetrics {
    const n = this.events.length || 1;
    const optimizedEvents = this.events.filter(
      (e) => e.optimizedCount < e.originalCount,
    );
    const optimizationRate = (optimizedEvents.length / n) * 100;

    const compressionRatios = this.events.map((e) =>
      e.originalCount > 0 ? e.optimizedCount / e.originalCount : 1,
    );
    const averageCompressionRatio =
      compressionRatios.reduce((a, b) => a + b, 0) / n;

    const times = this.events
      .map((e) => e.processingTimeMs)
      .sort((a, b) => a - b);
    const averageProcessingTimeMs =
      times.reduce((a, b) => a + b, 0) / (this.events.length || 1);
    const p50ProcessingTimeMs =
      times[Math.floor(0.5 * (times.length - 1))] || 0;
    const p95ProcessingTimeMs =
      times[Math.floor(0.95 * (times.length - 1))] || 0;

    return {
      events: this.events.length,
      optimizationRate,
      averageCompressionRatio,
      averageProcessingTimeMs,
      p50ProcessingTimeMs,
      p95ProcessingTimeMs,
    };
  }
}
