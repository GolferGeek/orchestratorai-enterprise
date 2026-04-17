/**
 * Sentinel Evaluate — Evaluate Loop Node.
 *
 * Stateless dispatcher matching the cross-reference-loop pattern.
 * Emits progress showing position in queue. The graph's conditional edges
 * handle the loop: after evaluate_signal, route back here if queue has
 * items, or to complete if empty.
 *
 * This node does not do the evaluation — it signals which item is next
 * and emits progress. The evaluate_signal node does the actual work.
 */
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { SentinelEvaluateState } from '../sentinel-evaluate.state';

export function createEvaluateLoopNode(observability: ObservabilityService) {
  return async function evaluateLoopNode(
    state: SentinelEvaluateState,
  ): Promise<Partial<SentinelEvaluateState>> {
    const ctx = state.executionContext;
    const remaining = state.unprocessedSignals.length;
    const completed = state.alerts.length;
    const total = remaining + completed;

    // Progress: 10-80% range proportional to signals evaluated
    const progress = 10 + Math.round((completed / Math.max(total, 1)) * 70);

    const nextSignal = state.unprocessedSignals[0];
    const nextLabel = nextSignal
      ? `"${nextSignal.title.slice(0, 60)}${nextSignal.title.length > 60 ? '...' : ''}"`
      : 'none';

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Evaluating signal ${completed + 1} of ${total}: ${nextLabel}`,
      {
        step: `sentinel_eval_loop_${completed + 1}_of_${total}`,
        progress,
        remaining,
        completed,
      },
    );

    return {};
  };
}
