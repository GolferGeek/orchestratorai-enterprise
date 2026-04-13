/**
 * Regulatory Compliance Audit — Cross-Reference Loop Node.
 *
 * Stateless dispatcher matching DD Room's dispatch-loop pattern.
 * Emits progress showing position in queue. The graph's conditional edges
 * handle the loop: after evaluate_finding, route back here if queue has
 * items, or to hitl_gate if empty.
 *
 * This node does not do the evaluation — it signals which item is next
 * and emits progress. The evaluate_finding node does the actual work.
 *
 * See: docs/efforts/current/regulatory-compliance-audit/prd.md §4.1.1
 */
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { ComplianceAuditState } from '../compliance-audit.state';

export function createCrossReferenceLoopNode(
  observability: ObservabilityService,
) {
  return async function crossReferenceLoopNode(
    state: ComplianceAuditState,
  ): Promise<Partial<ComplianceAuditState>> {
    const ctx = state.executionContext;
    const remaining = state.evaluationQueue.length;
    const completed = state.evaluationsCompleted.length;
    const failed = Object.keys(state.evaluationsFailed).length;
    const total = remaining + completed + failed;

    // Progress: 25-75% range proportional to evaluations completed
    const completedCount = completed + failed;
    const progress =
      25 + Math.round((completedCount / Math.max(total, 1)) * 50);

    const nextItem = state.evaluationQueue[0];
    const nextLabel = nextItem
      ? nextItem.type === 'policy-section'
        ? `section: ${nextItem.sectionId.slice(0, 8)}...`
        : `theme: ${nextItem.themeName} — ${nextItem.questionText.slice(0, 50)}...`
      : 'none';

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Cross-referencing ${completedCount + 1} of ${total}: ${nextLabel}`,
      {
        step: `ca_cross_ref_${completedCount + 1}_of_${total}`,
        progress,
        remaining,
        completed,
        failed,
      },
    );

    return {};
  };
}
