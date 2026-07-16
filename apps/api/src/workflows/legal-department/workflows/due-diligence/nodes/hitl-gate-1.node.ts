/**
 * Due Diligence Room — HITL Gate 1 (Post-Extraction Review).
 *
 * Calls interrupt() presenting the document index, running findings
 * summaries, and initial specialist findings for attorney review.
 *
 * Resume routing:
 * - approve → synthesis
 * - reject → re-run analysis with feedback
 * - modify → apply classification corrections + document skips
 * - deepen → fire Legal Research on flagged docs
 * - redirect → add focus areas and re-classify
 *
 * See: docs/efforts/current/due-diligence-room/prd.md §4.1.1 (node 5)
 */
import { interrupt } from '@langchain/langgraph';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { ReviewDecisionPayload } from '../../../jobs/legal-jobs.types';
import type { DueDiligenceState } from '../due-diligence.state';

export function createHitlGate1Node(observability: ObservabilityService) {
  return async function hitlGate1Node(
    state: DueDiligenceState,
  ): Promise<Partial<DueDiligenceState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'HITL Gate 1: Awaiting attorney review of document analysis',
      {
        step: 'dd_hitl_gate_1_start',
        progress: 75,
        reviewRequired: true,
      },
    );

    // Build the review payload for the attorney
    const reviewPayload = {
      gate: 'extraction' as const,
      dealContext: state.dealContext,
      documentIndex: state.documentIndex,
      runningFindings: state.runningFindings,
      totalDocuments: state.documents.length,
      analyzed: state.documentsAnalyzed.length,
      failed: Object.keys(state.documentsFailed).length,
    };

    // interrupt() throws GraphInterrupt on first run; returns decision on resume
    const decision = interrupt<typeof reviewPayload, ReviewDecisionPayload>(
      reviewPayload,
    );

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `HITL Gate 1: decision=${decision.decision}`,
      {
        step: 'dd_hitl_gate_1_complete',
        progress: 76,
        decision: decision.decision,
      },
    );

    return {
      hitlGate1Decision: decision,
      status: 'synthesizing',
    };
  };
}
