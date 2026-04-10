/**
 * Legal Research HITL Checkpoint — pauses the workflow for attorney review.
 *
 * Uses interrupt() with the memo, research tree, and unverified citation list.
 * Phase 1 supports 'approve' only; 'deepen'/'redirect' added in Phase 4.
 *
 * See: PRD §4.1 — hitl_checkpoint
 */
import { interrupt } from '@langchain/langgraph';
import type { LegalResearchState } from '../legal-research.state';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { ReviewDecisionPayload } from '../../../jobs/legal-jobs.types';

export function createResearchHitlNode(observability: ObservabilityService) {
  return async function hitlCheckpointNode(
    state: LegalResearchState,
  ): Promise<Partial<LegalResearchState>> {
    const ctx = state.executionContext;

    // Collect unverified citations
    const unverifiedCitations = state.researchTree
      .flatMap((n) => n.citations ?? [])
      .filter((c) => !c.verified);

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Legal Research HITL: awaiting attorney review',
      {
        step: 'lr_hitl_start',
        progress: 70,
        reviewRequired: true,
        unverifiedCitationCount: unverifiedCitations.length,
      },
    );

    const reviewPayload = {
      memo: state.memo,
      researchTree: state.researchTree,
      unverifiedCitations,
      tokenUsage: state.tokenUsage,
      jurisdiction: state.jurisdiction,
      practiceArea: state.practiceArea,
    };

    const decision = interrupt<typeof reviewPayload, ReviewDecisionPayload>(
      reviewPayload,
    );

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Legal Research HITL: decision received — ${decision.decision}`,
      {
        step: 'lr_hitl_complete',
        progress: 75,
        decision: decision.decision,
      },
    );

    // Map the decision to state changes
    if (decision.decision === 'approve') {
      return {};
    }

    if (decision.decision === 'deepen') {
      return {
        hitlAction: {
          type: 'deepen',
          targetNodeIds: decision.targetNodeIds,
          guidance: decision.guidance,
        },
      };
    }

    if (decision.decision === 'redirect') {
      return {
        hitlAction: {
          type: 'redirect',
          targetNodeId: decision.targetNodeId,
          replacementQuestions: decision.replacementQuestions,
        },
      };
    }

    // Fallback for reject/modify — treat as approve for now
    return {};
  };
}
