/**
 * Discovery Review — Batch HITL: Low-Confidence Relevance Node.
 *
 * Pauses graph execution for human review of the low_confidence_relevance
 * batch (documents below the protocol's confidenceThreshold whose relevance
 * classification is uncertain).
 *
 * Unlike the privilege gate, `approveRemaining` IS allowed here — the
 * attorney can bulk-approve any remaining uncorrected documents in the batch.
 *
 * Interrupt payload:
 *   { batchId, batchType: 'low_confidence_relevance', documents: DocumentCoding[] }
 *
 * Resume payload (BatchReviewDecisionPayload):
 *   { batchId, documentDecisions: BatchDocumentDecision[], approveRemaining?: boolean }
 *
 * If no low_confidence_relevance batch exists, the node passes through immediately.
 *
 * See: docs/efforts/current/discovery-document-review/plan.md §3.3
 */
import { interrupt } from '@langchain/langgraph';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DiscoveryReviewState } from '../discovery-review.state';
import type {
  BatchReviewDecisionPayload,
  DocumentCoding,
} from '../discovery-review.types';

export function createBatchHitlRelevanceNode(
  observability: ObservabilityService,
) {
  return async function batchHitlRelevanceNode(
    state: DiscoveryReviewState,
  ): Promise<Partial<DiscoveryReviewState>> {
    const ctx = state.executionContext;

    const relevanceBatch = state.reviewBatches.find(
      (b) => b.batchType === 'low_confidence_relevance',
    );

    if (!relevanceBatch) {
      // No low-confidence relevance batch — skip this gate.
      return {};
    }

    const documents: DocumentCoding[] = relevanceBatch.documentIds
      .map((id) => state.documentCodings[id])
      .filter((c): c is DocumentCoding => c !== undefined);

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Relevance review gate: ${documents.length} low-confidence documents awaiting attorney review`,
      {
        step: 'dr:relevance_review_start',
        batchId: relevanceBatch.batchId,
        documentCount: documents.length,
      },
    );

    // First invocation: throws GraphInterrupt, pausing the graph.
    // Resume invocation: returns the BatchReviewDecisionPayload.
    const decision = interrupt<
      {
        batchId: string;
        batchType: 'low_confidence_relevance';
        documents: DocumentCoding[];
      },
      BatchReviewDecisionPayload
    >({
      batchId: relevanceBatch.batchId,
      batchType: 'low_confidence_relevance',
      documents,
    });

    // approveRemaining is accepted — no guard needed here.

    const updatedBatches = state.reviewBatches.map((b) =>
      b.batchId === relevanceBatch.batchId
        ? { ...b, status: 'completed' as const }
        : b,
    );

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Relevance batch reviewed: ${decision.documentDecisions.length} decisions, approveRemaining=${decision.approveRemaining ?? false}`,
      {
        step: 'dr:batch_reviewed',
        batchId: relevanceBatch.batchId,
        batchType: 'low_confidence_relevance',
        decisionCount: decision.documentDecisions.length,
        approveRemaining: decision.approveRemaining ?? false,
      },
    );

    return {
      reviewBatches: updatedBatches,
      batchDecisions: { [relevanceBatch.batchId]: decision },
      status: 'awaiting_relevance_review',
    };
  };
}
