/**
 * HITL Checkpoint Node — pauses the workflow for attorney review.
 *
 * Uses interrupt() to pause the graph. The attorney reviews the stress-test
 * report and submits a decision:
 * - approve-and-fortify: accept selected recommendations, produce fortified brief
 * - approve-without-fortification: accept the report as-is
 * - reject-and-rerun: send back to debate loop with guidance
 */
import { interrupt } from '@langchain/langgraph';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type {
  AdversarialBriefState,
  AdversarialHitlDecision,
} from '../adversarial-brief.state';

export function createAdversarialHitlNode(observability: ObservabilityService) {
  return async function hitlCheckpointNode(
    state: AdversarialBriefState,
  ): Promise<Partial<AdversarialBriefState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Adversarial Brief HITL: awaiting attorney review',
      {
        step: 'hitl_checkpoint_start',
        progress: 85,
        reviewRequired: true,
      },
    );

    const reviewPayload = {
      stressTestReport: state.stressTestReport,
      debateRounds: state.rounds.length,
      convergenceReason: state.convergenceReason,
      tokenUsage: state.tokenUsage,
    };

    const decision = interrupt<typeof reviewPayload, AdversarialHitlDecision>(
      reviewPayload,
    );

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Adversarial Brief HITL: decision received — ${decision.type}`,
      {
        step: 'hitl_checkpoint_complete',
        progress: 88,
        decision: decision.type,
      },
    );

    return {
      hitlDecision: decision,
      acceptedFortifications: decision.acceptedRecommendations ?? [],
    };
  };
}
