/**
 * Discovery Review — Dispatch Loop Node.
 *
 * Pops the next document ID from the queue and sets `currentDocumentId`.
 * The conditional edge from this node routes to:
 *   - `code_document` when the queue is non-empty
 *   - `complete`       when the queue is empty
 *
 * The routing function is exported alongside the node factory so the graph
 * builder can use it directly in addConditionalEdges().
 *
 * See: docs/efforts/current/discovery-document-review/plan.md §2.1
 */
import type { DiscoveryReviewState } from '../discovery-review.state';

export function createDispatchLoopNode() {
  return function dispatchLoopNode(
    state: DiscoveryReviewState,
  ): Partial<DiscoveryReviewState> {
    if (state.documentQueue.length === 0) {
      // Queue is empty — nothing to update; routing handles transition to complete.
      return {};
    }

    const [next, ...remaining] = state.documentQueue;
    return {
      documentQueue: remaining,
      currentDocumentId: next,
    };
  };
}

/**
 * Conditional edge router for the dispatch_loop node.
 * Returns 'code_document' while the node set a currentDocumentId, 'complete' otherwise.
 *
 * After dispatch_loop runs:
 *   - If queue had items:  currentDocumentId is set → route to code_document
 *   - If queue was empty:  currentDocumentId is undefined → route to complete
 */
export function dispatchLoopRouter(
  state: DiscoveryReviewState,
): 'code_document' | 'complete' {
  return state.currentDocumentId !== undefined ? 'code_document' : 'complete';
}
