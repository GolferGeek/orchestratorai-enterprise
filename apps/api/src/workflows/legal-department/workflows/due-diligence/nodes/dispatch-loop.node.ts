/**
 * Due Diligence Room — Dispatch Loop Node.
 *
 * Pops the next document from the queue, dispatches it for analysis.
 * For Ollama: sequential (one at a time). For cloud: batch up to
 * concurrency limit.
 *
 * This node is called in a loop via conditional edges. Each invocation
 * processes one document (or a batch for cloud providers).
 *
 * See: docs/efforts/current/due-diligence-room/prd.md §4.1.2
 */
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DueDiligenceState } from '../due-diligence.state';

export function createDispatchLoopNode(observability: ObservabilityService) {
  return async function dispatchLoopNode(
    state: DueDiligenceState,
  ): Promise<Partial<DueDiligenceState>> {
    const ctx = state.executionContext;
    const remaining = state.documentQueue.length;
    const total = state.documents.length;
    const analyzed = state.documentsAnalyzed.length;
    const failed = Object.keys(state.documentsFailed).length;

    // Progress: 10-75% range proportional to documents completed
    const completedCount = analyzed + failed;
    const progress = 10 + Math.round((completedCount / total) * 65);

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Analyzing document ${completedCount + 1} of ${total} (${remaining} remaining)`,
      {
        step: `analyzing_doc_${completedCount + 1}_of_${total}`,
        progress,
        remaining,
        analyzed,
        failed,
      },
    );

    // Dispatch loop itself doesn't do the analysis — it just signals
    // which document is next. The analyze_document node does the actual
    // work. The graph's conditional edge handles the loop.
    return {};
  };
}
