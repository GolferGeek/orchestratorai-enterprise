/**
 * Discovery Review — Batch HITL: Hot Documents Node.
 *
 * Pauses graph execution for human review of the hot_documents batch.
 * Hot documents are flagged because they contain highly sensitive or
 * particularly significant content that warrants senior attorney attention.
 *
 * Interrupt payload:
 *   { batchId, batchType: 'hot_documents', documents: DocumentCoding[] }
 *
 * Resume payload (BatchReviewDecisionPayload):
 *   { batchId, documentDecisions: BatchDocumentDecision[], approveRemaining?: boolean }
 *
 * `approveRemaining` is allowed but each document's `flagSeniorReview` field
 * is respected — documents flagged for senior review are noted in decisions.
 *
 * If no hot_documents batch exists, the node passes through immediately.
 *
 * See: docs/efforts/current/discovery-document-review/plan.md §3.4
 */
import { interrupt } from '@langchain/langgraph';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DiscoveryReviewState } from '../discovery-review.state';
import type {
  BatchReviewDecisionPayload,
  DocumentCoding,
} from '../discovery-review.types';

export function createBatchHitlHotDocsNode(
  observability: ObservabilityService,
) {
  return async function batchHitlHotDocsNode(
    state: DiscoveryReviewState,
  ): Promise<Partial<DiscoveryReviewState>> {
    const ctx = state.executionContext;

    const hotDocsBatch = state.reviewBatches.find(
      (b) => b.batchType === 'hot_documents',
    );

    if (!hotDocsBatch) {
      // No hot documents batch — skip this gate.
      return {};
    }

    const documents: DocumentCoding[] = hotDocsBatch.documentIds
      .map((id) => state.documentCodings[id])
      .filter((c): c is DocumentCoding => c !== undefined);

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Hot documents review gate: ${documents.length} documents awaiting attorney review`,
      {
        step: 'dr:hot_docs_review_start',
        batchId: hotDocsBatch.batchId,
        documentCount: documents.length,
      },
    );

    // First invocation: throws GraphInterrupt, pausing the graph.
    // Resume invocation: returns the BatchReviewDecisionPayload.
    const decision = interrupt<
      {
        batchId: string;
        batchType: 'hot_documents';
        documents: DocumentCoding[];
      },
      BatchReviewDecisionPayload
    >({
      batchId: hotDocsBatch.batchId,
      batchType: 'hot_documents',
      documents,
    });

    const updatedBatches = state.reviewBatches.map((b) =>
      b.batchId === hotDocsBatch.batchId
        ? { ...b, status: 'completed' as const }
        : b,
    );

    const seniorFlagCount = decision.documentDecisions.filter(
      (d) => d.flagSeniorReview === true,
    ).length;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Hot documents batch reviewed: ${decision.documentDecisions.length} decisions, ${seniorFlagCount} flagged for senior review`,
      {
        step: 'dr:batch_reviewed',
        batchId: hotDocsBatch.batchId,
        batchType: 'hot_documents',
        decisionCount: decision.documentDecisions.length,
        seniorFlagCount,
      },
    );

    return {
      reviewBatches: updatedBatches,
      batchDecisions: { [hotDocsBatch.batchId]: decision },
      status: 'awaiting_hot_doc_review',
    };
  };
}
