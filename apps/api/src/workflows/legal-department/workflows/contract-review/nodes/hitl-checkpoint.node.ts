/**
 * Contract-review HITL checkpoint — per-clause review decisions.
 *
 * Extends the base HITL pattern with redlineOutput and clauseMap in the
 * interrupt payload, and handles ClauseReviewPayload decisions (per-clause
 * accept/reject/modify) alongside the existing ReviewDecisionPayload.
 */
import { interrupt } from '@langchain/langgraph';
import { LegalDepartmentState } from '../../../legal-department.state';
import type { ClauseReviewPayload } from '../../../legal-department.types';
import { ObservabilityService } from '../../../../shared/services/observability.service';
import type { ReviewDecisionPayload } from '../../../jobs/legal-jobs.types';

type CombinedDecision = ReviewDecisionPayload | ClauseReviewPayload;

function isClauseReview(d: CombinedDecision): d is ClauseReviewPayload {
  return 'clauseDecisions' in d;
}

export function createContractReviewHitlNode(
  observability: ObservabilityService,
) {
  return async function hitlCheckpointNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Contract Review HITL: awaiting per-clause review',
      {
        step: 'cr_hitl_start',
        progress: 85,
        reviewRequired: true,
      },
    );

    // Include redlineOutput and clauseMap in the interrupt payload
    const reviewPayload = {
      specialistOutputs: state.specialistOutputs ?? {},
      synthesis: state.orchestration?.synthesis,
      redlineOutput: state.redlineOutput,
      clauseMap: state.clauseMap,
      documentsSummary: (state.documents ?? []).map((d) => ({
        name: d.name,
        type: d.type,
        length: d.content?.length ?? 0,
      })),
    };

    const decision = interrupt<typeof reviewPayload, CombinedDecision>(
      reviewPayload,
    );

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Contract Review HITL: decision received`,
      {
        step: 'cr_hitl_complete',
        progress: 90,
        isClauseReview: isClauseReview(decision),
      },
    );

    // Handle per-clause decisions
    if (isClauseReview(decision)) {
      // Apply clause decisions to the redlineOutput
      const redlineOutput = state.redlineOutput;
      if (redlineOutput) {
        for (const clauseDecision of decision.clauseDecisions) {
          const clause = redlineOutput.clauses.find(
            (c) => c.clauseId === clauseDecision.clauseId,
          );
          if (!clause) continue;

          switch (clauseDecision.decision) {
            case 'accept':
              // Keep suggestedRedline as-is (will be used in report)
              break;
            case 'reject':
              // Remove suggested redline — original language kept
              clause.suggestedRedline = undefined;
              break;
            case 'modify':
              // Use reviewer's edited text
              clause.suggestedRedline = clauseDecision.modifiedLanguage;
              break;
          }
        }
      }

      // Check if any clauses were rejected — determines routing
      const hasRejections = decision.clauseDecisions.some(
        (d) => d.decision === 'reject',
      );

      return {
        redlineOutput,
        orchestration: {
          ...state.orchestration,
          hitlApproved: !hasRejections,
          hitlApprovedAt: new Date().toISOString(),
          hitlDecision: hasRejections
            ? {
                decision: 'reject',
                feedback: `Clauses rejected: ${decision.clauseDecisions
                  .filter((d) => d.decision === 'reject')
                  .map((d) => d.clauseId)
                  .join(', ')}`,
              }
            : { decision: 'approve' },
        },
      };
    }

    // Fallback: standard ReviewDecisionPayload (approve/reject/modify)
    const patch: Partial<LegalDepartmentState> = {
      orchestration: {
        ...state.orchestration,
        hitlApproved: decision.decision === 'approve',
        hitlApprovedAt: new Date().toISOString(),
        hitlDecision: decision,
      },
    };

    if (decision.decision === 'modify') {
      patch.specialistOutputs = {
        ...state.specialistOutputs,
        ...(decision.editedOutputs as LegalDepartmentState['specialistOutputs']),
      };
    }

    return patch;
  };
}
