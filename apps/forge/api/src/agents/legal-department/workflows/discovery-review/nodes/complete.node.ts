/**
 * Discovery Review — Complete Node.
 *
 * Terminal node: emits completion telemetry and sets status to 'completed'.
 * The production set and privilege log have already been populated by
 * generate-production-set.node.ts.
 *
 * See: docs/efforts/current/discovery-document-review/plan.md §4.4
 */
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DiscoveryReviewState } from '../discovery-review.state';

export function createCompleteNode(observability: ObservabilityService) {
  return async function completeNode(
    state: DiscoveryReviewState,
  ): Promise<Partial<DiscoveryReviewState>> {
    const ctx = state.executionContext;
    const duration = Date.now() - state.startedAt;

    await observability.emitCompleted(
      ctx,
      ctx.conversationId,
      {
        totalDocuments: state.documents.length,
        coded: state.documentsCoded.length,
        failed: Object.keys(state.documentsFailed).length,
        productionSetSize: state.productionSet.length,
        privilegeCount: state.privilegeLog.length,
        batchesReviewed: state.reviewBatches.filter(
          (b) => b.status === 'completed',
        ).length,
        calibrationAdjustments: state.calibrationAdjustments.length,
      },
      duration,
    );

    return {
      status: 'completed',
      completedAt: Date.now(),
    };
  };
}
