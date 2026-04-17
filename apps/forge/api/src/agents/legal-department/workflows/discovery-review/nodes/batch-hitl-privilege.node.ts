/**
 * Discovery Review — Batch HITL: Privilege Node.
 *
 * Pauses graph execution for human review of the privilege batch.
 * Safety rule: `approveRemaining` is never accepted for privilege documents —
 * every privileged or potentially-privileged document requires an explicit
 * per-document decision.
 *
 * Interrupt payload:
 *   { batchId, batchType: 'privilege', documents: DocumentCoding[] }
 *
 * Resume payload (BatchReviewDecisionPayload):
 *   { batchId, documentDecisions: BatchDocumentDecision[] }
 *   approveRemaining MUST be absent or false — the node throws on violation.
 *
 * If no privilege batch exists in state.reviewBatches, the node passes through
 * immediately without interrupting.
 *
 * See: docs/efforts/current/discovery-document-review/plan.md §3.2
 */
import { interrupt } from '@langchain/langgraph';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DiscoveryReviewState } from '../discovery-review.state';
import type {
  BatchReviewDecisionPayload,
  DocumentCoding,
} from '../discovery-review.types';

export function createBatchHitlPrivilegeNode(
  observability: ObservabilityService,
) {
  return async function batchHitlPrivilegeNode(
    state: DiscoveryReviewState,
  ): Promise<Partial<DiscoveryReviewState>> {
    const ctx = state.executionContext;

    const privilegeBatch = state.reviewBatches.find(
      (b) => b.batchType === 'privilege',
    );

    if (!privilegeBatch) {
      // No privilege batch — skip this gate entirely.
      return {};
    }

    const documents: DocumentCoding[] = privilegeBatch.documentIds
      .map((id) => state.documentCodings[id])
      .filter((c): c is DocumentCoding => c !== undefined);

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Privilege review gate: ${documents.length} documents awaiting attorney review`,
      {
        step: 'dr:privilege_review_start',
        batchId: privilegeBatch.batchId,
        documentCount: documents.length,
      },
    );

    // First invocation: throws GraphInterrupt, pausing the graph.
    // Resume invocation: returns the BatchReviewDecisionPayload.
    const decision = interrupt<
      { batchId: string; batchType: 'privilege'; documents: DocumentCoding[] },
      BatchReviewDecisionPayload
    >({
      batchId: privilegeBatch.batchId,
      batchType: 'privilege',
      documents,
    });

    // Safety rule: privilege batches must never use bulk approve.
    if (decision.approveRemaining === true) {
      throw new Error(
        'Privilege batch does not allow approveRemaining — every privileged document requires an explicit per-document decision',
      );
    }

    // Mark batch completed and record decision.
    const updatedBatches = state.reviewBatches.map((b) =>
      b.batchId === privilegeBatch.batchId
        ? { ...b, status: 'completed' as const }
        : b,
    );

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Privilege batch reviewed: ${decision.documentDecisions.length} decisions recorded`,
      {
        step: 'dr:batch_reviewed',
        batchId: privilegeBatch.batchId,
        batchType: 'privilege',
        decisionCount: decision.documentDecisions.length,
      },
    );

    return {
      reviewBatches: updatedBatches,
      batchDecisions: { [privilegeBatch.batchId]: decision },
      status: 'awaiting_privilege_review',
    };
  };
}
