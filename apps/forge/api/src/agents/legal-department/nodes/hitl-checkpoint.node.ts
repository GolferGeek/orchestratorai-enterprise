import { interrupt } from '@langchain/langgraph';
import { LegalDepartmentState } from '../legal-department.state';
import { ObservabilityService } from '../../shared/services/observability.service';
import type { ReviewDecisionPayload } from '../jobs/legal-jobs.types';

/**
 * HITL (Human-in-the-Loop) Checkpoint Node — production
 *
 * Calls LangGraph's `interrupt()` with a review payload derived from state.
 * The calling worker catches the GraphInterrupt exception, flips the job row
 * to `awaiting_review`, and releases its provider concurrency slot. When a
 * reviewer decides via POST /jobs/:id/review, the worker resumes the graph
 * with `Command({ resume: ReviewDecisionPayload })`; control returns here
 * and interrupt() returns the decision, which the graph routing reads out
 * of state.
 *
 * The decision is stashed on state.orchestration.hitlDecision so the
 * conditional edges after this node can branch on approve / reject / modify
 * without re-reading the Command payload.
 */
export function createHitlCheckpointNode(observability: ObservabilityService) {
  return async function hitlCheckpointNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'HITL Checkpoint: awaiting attorney review',
      {
        step: 'hitl_checkpoint_start',
        progress: 85,
        reviewRequired: true,
      },
    );

    // Build the payload the reviewer sees. Everything needed to render the
    // review modal without re-reading the checkpointer.
    const reviewPayload = {
      specialistOutputs: state.specialistOutputs ?? {},
      synthesis: state.orchestration?.synthesis,
      documentsSummary: (state.documents ?? []).map((d) => ({
        name: d.name,
        type: d.type,
        length: d.content?.length ?? 0,
      })),
    };

    // interrupt() throws a GraphInterrupt the first time the node runs; on
    // resume it returns the `Command.resume` payload. The generics tell
    // the eslint unsafe-any rules exactly what we expect back.
    const decision = interrupt<typeof reviewPayload, ReviewDecisionPayload>(
      reviewPayload,
    );

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `HITL Checkpoint: decision=${decision.decision}`,
      {
        step: 'hitl_checkpoint_complete',
        progress: 90,
        decision: decision.decision,
      },
    );

    // Record the decision on state so the graph's conditional edges can
    // route on it. For `modify`, overwrite the specialist outputs with the
    // reviewer's edits.
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
