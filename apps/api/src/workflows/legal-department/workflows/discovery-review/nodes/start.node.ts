/**
 * Discovery Review — Start Node.
 *
 * Initializes the workflow: emits the `dr:started` SSE event, sets
 * `status` to `protocol_setup`, and records the start time.
 * The reviewProtocol and documents are already present in state (set by
 * LegalDepartmentService.processDiscoveryReview before invoking the graph).
 *
 * See: docs/efforts/current/discovery-document-review/plan.md §1.3
 */
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DiscoveryReviewState } from '../discovery-review.state';
import { HumanMessage } from '@langchain/core/messages';

export function createStartNode(observability: ObservabilityService) {
  return async function startNode(
    state: DiscoveryReviewState,
  ): Promise<Partial<DiscoveryReviewState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Starting Discovery Review: "${state.reviewProtocol.matterName}" — ${state.documents.length} documents`,
      {
        step: 'dr:started',
        progress: 1,
        matterId: state.reviewProtocol.matterId,
        matterName: state.reviewProtocol.matterName,
        documentCount: state.documents.length,
      },
    );

    return {
      status: 'protocol_setup',
      startedAt: Date.now(),
      messages: [
        new HumanMessage(
          `Discovery Review: "${state.reviewProtocol.matterName}" — ${state.documents.length} documents — ${state.reviewProtocol.relevanceCriteria.claims.join(', ')}`,
        ),
      ],
    };
  };
}
