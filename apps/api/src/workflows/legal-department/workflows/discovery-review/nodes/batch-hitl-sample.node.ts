/**
 * Discovery Review — Batch HITL: Random Sample Node.
 *
 * Pauses graph execution for quality-control review of the random sample
 * batch (~5% of high-confidence not_relevant documents). Reviewer corrections
 * on this batch feed into the calibration check node to detect systematic
 * coding errors.
 *
 * Interrupt payload:
 *   { batchId, batchType: 'sample', documents: DocumentCoding[] }
 *
 * Resume payload (BatchReviewDecisionPayload):
 *   { batchId, documentDecisions: BatchDocumentDecision[], approveRemaining?: boolean }
 *
 * `approveRemaining` is allowed. All `correct` decisions are preserved in
 * batchDecisions for the calibration node to inspect.
 *
 * If no sample batch exists, the node passes through immediately.
 *
 * See: docs/efforts/current/discovery-document-review/plan.md §3.5
 */
import { interrupt } from '@langchain/langgraph';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DiscoveryReviewState } from '../discovery-review.state';
import type {
  BatchReviewDecisionPayload,
  DocumentCoding,
} from '../discovery-review.types';

export function createBatchHitlSampleNode(observability: ObservabilityService) {
  return async function batchHitlSampleNode(
    state: DiscoveryReviewState,
  ): Promise<Partial<DiscoveryReviewState>> {
    const ctx = state.executionContext;

    const sampleBatch = state.reviewBatches.find(
      (b) => b.batchType === 'sample',
    );

    if (!sampleBatch) {
      // No sample batch — skip this gate.
      return {};
    }

    const documents: DocumentCoding[] = sampleBatch.documentIds
      .map((id) => state.documentCodings[id])
      .filter((c): c is DocumentCoding => c !== undefined);

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Sample review gate: ${documents.length} documents for quality-control review`,
      {
        step: 'dr:sample_review_start',
        batchId: sampleBatch.batchId,
        documentCount: documents.length,
      },
    );

    // First invocation: throws GraphInterrupt, pausing the graph.
    // Resume invocation: returns the BatchReviewDecisionPayload.
    const decision = interrupt<
      {
        batchId: string;
        batchType: 'sample';
        documents: DocumentCoding[];
      },
      BatchReviewDecisionPayload
    >({
      batchId: sampleBatch.batchId,
      batchType: 'sample',
      documents,
    });

    const correctionCount = decision.documentDecisions.filter(
      (d) => d.action === 'correct',
    ).length;

    const updatedBatches = state.reviewBatches.map((b) =>
      b.batchId === sampleBatch.batchId
        ? { ...b, status: 'completed' as const }
        : b,
    );

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Sample batch reviewed: ${decision.documentDecisions.length} decisions, ${correctionCount} corrections for calibration`,
      {
        step: 'dr:batch_reviewed',
        batchId: sampleBatch.batchId,
        batchType: 'sample',
        decisionCount: decision.documentDecisions.length,
        correctionCount,
      },
    );

    return {
      reviewBatches: updatedBatches,
      batchDecisions: { [sampleBatch.batchId]: decision },
      status: 'awaiting_sample_review',
    };
  };
}
