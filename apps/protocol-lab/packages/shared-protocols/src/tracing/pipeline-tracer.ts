import { PipelineStep, PipelineTrace } from './types';
import { ProvenanceLabel } from '@agent-communication/shared-types';
import { randomUUID } from 'crypto';

export class PipelineTracer {
  private steps: PipelineStep[] = [];
  private startTime: number;
  private readonly traceId: string;
  private readonly source: string;
  private readonly target: string;
  private readonly method: string;

  constructor(opts: { source: string; target: string; method: string; traceId?: string }) {
    this.traceId = opts.traceId || randomUUID();
    this.source = opts.source;
    this.target = opts.target;
    this.method = opts.method;
    this.startTime = Date.now();
  }

  /**
   * Record a pipeline step with data snapshot and optional metadata.
   * Can be called manually or used with trace() for automatic timing.
   * If no provenance is provided, defaults to { state: 'executed-live' }.
   */
  addStep(step: Omit<PipelineStep, 'step' | 'timestamp' | 'durationMs'> & { durationMs?: number }): void {
    const provenance: ProvenanceLabel = step.provenance ?? { state: 'executed-live' };
    this.steps.push({
      ...step,
      provenance,
      step: this.steps.length + 1,
      timestamp: new Date().toISOString(),
      durationMs: step.durationMs ?? 0,
    });
  }

  /**
   * Execute an async function and record it as a pipeline step.
   * Captures the data returned by the function as the step's data snapshot.
   * If no provenance is provided in metadata, defaults to { state: 'executed-live' }.
   */
  async trace<T extends Record<string, unknown>>(
    label: string,
    layer: string,
    provider: string,
    fn: () => Promise<T>,
    metadata?: PipelineStep['metadata'],
    provenance?: ProvenanceLabel,
  ): Promise<T> {
    const stepStart = Date.now();
    const result = await fn();
    const durationMs = Date.now() - stepStart;

    this.addStep({
      label,
      layer,
      provider,
      data: result,
      metadata,
      provenance: provenance ?? { state: 'executed-live' },
      durationMs,
    });

    return result;
  }

  /**
   * Execute a sync function and record it as a pipeline step.
   * If no provenance is provided, defaults to { state: 'executed-live' }.
   */
  traceSync<T extends Record<string, unknown>>(
    label: string,
    layer: string,
    provider: string,
    fn: () => T,
    metadata?: PipelineStep['metadata'],
    provenance?: ProvenanceLabel,
  ): T {
    const stepStart = Date.now();
    const result = fn();
    const durationMs = Date.now() - stepStart;

    this.addStep({
      label,
      layer,
      provider,
      data: result,
      metadata,
      provenance: provenance ?? { state: 'executed-live' },
      durationMs,
    });

    return result;
  }

  /**
   * Build the complete PipelineTrace.
   */
  complete(messageId: string): PipelineTrace {
    const now = new Date().toISOString();
    const providersUsed = [...new Set(this.steps.map(s => s.provider))];

    return {
      traceId: this.traceId,
      messageId,
      source: this.source,
      target: this.target,
      method: this.method,
      steps: this.steps,
      totalDurationMs: Date.now() - this.startTime,
      startedAt: new Date(this.startTime).toISOString(),
      completedAt: now,
      providersUsed,
    };
  }

  /**
   * Get current step count.
   */
  get stepCount(): number {
    return this.steps.length;
  }

  /**
   * Get the trace ID.
   */
  get id(): string {
    return this.traceId;
  }
}
