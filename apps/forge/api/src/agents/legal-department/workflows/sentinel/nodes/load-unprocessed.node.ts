/**
 * Sentinel Evaluate — Load Unprocessed Signals Node.
 *
 * Queries legal.sentinel_signals WHERE processed = false for the org.
 * Populates the evaluation queue with unprocessed signals.
 */
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { SentinelRepository } from '../../../sentinel/sentinel.repository';
import type { SentinelEvaluateState } from '../sentinel-evaluate.state';

export function createLoadUnprocessedNode(
  observability: ObservabilityService,
  repository: SentinelRepository,
) {
  return async function loadUnprocessedNode(
    state: SentinelEvaluateState,
  ): Promise<Partial<SentinelEvaluateState>> {
    const ctx = state.executionContext;
    const orgSlug = ctx.orgSlug;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Loading unprocessed signals',
      { step: 'sentinel_eval_load_start', progress: 5 },
    );

    const signals = await repository.listSignals(orgSlug, {
      processed: false,
      limit: 100,
    });

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Found ${signals.length} unprocessed signals`,
      {
        step: 'sentinel_eval_load_complete',
        progress: 10,
        signalCount: signals.length,
      },
    );

    return {
      unprocessedSignals: signals,
      status: signals.length > 0 ? 'evaluating' : 'completed',
    };
  };
}
