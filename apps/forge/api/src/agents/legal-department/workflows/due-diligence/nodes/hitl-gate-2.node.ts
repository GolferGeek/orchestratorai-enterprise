/**
 * Due Diligence Room — HITL Gate 2 (Post-Synthesis Review).
 *
 * Calls interrupt() presenting risk matrix, deal-breaker flags,
 * per-category summaries, and missing documents for attorney review.
 *
 * See: docs/efforts/current/due-diligence-room/prd.md §4.1.1 (node 7)
 */
import { interrupt } from '@langchain/langgraph';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { ReviewDecisionPayload } from '../../../jobs/legal-jobs.types';
import type { DueDiligenceState } from '../due-diligence.state';

export function createHitlGate2Node(observability: ObservabilityService) {
  return async function hitlGate2Node(
    state: DueDiligenceState,
  ): Promise<Partial<DueDiligenceState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'HITL Gate 2: Awaiting attorney review of synthesis results',
      {
        step: 'dd_hitl_gate_2_start',
        progress: 85,
        reviewRequired: true,
      },
    );

    const reviewPayload = {
      gate: 'synthesis' as const,
      dealContext: state.dealContext,
      riskMatrix: state.riskMatrix,
      dealBreakerFlags: state.dealBreakerFlags,
      perCategoryAnalysis: state.perCategoryAnalysis,
      missingDocuments: state.missingDocuments,
      crossReferenceMap: state.crossReferenceMap,
      documentIndex: state.documentIndex,
    };

    const decision = interrupt<typeof reviewPayload, ReviewDecisionPayload>(
      reviewPayload,
    );

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `HITL Gate 2: decision=${decision.decision}`,
      {
        step: 'dd_hitl_gate_2_complete',
        progress: 86,
        decision: decision.decision,
      },
    );

    return {
      hitlGate2Decision: decision,
      status: 'generating_report',
    };
  };
}
