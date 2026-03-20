import { LegalDepartmentState } from '../legal-department.state';
import { ObservabilityService } from '../../shared/services/observability.service';

/**
 * HITL (Human-in-the-Loop) Checkpoint Node - M12
 *
 * Purpose: Pause workflow for attorney review before final output.
 *
 * This checkpoint node:
 * 1. Pauses the workflow at a designated point
 * 2. Emits a special event for UI to show review panel
 * 3. Waits for external approval/rejection signal
 * 4. Continues or halts workflow based on attorney decision
 *
 * M12 Demo Implementation:
 * - Simple pass-through for demo (approval assumed)
 * - Infrastructure in place for future interactive HITL
 * - Event emitted for UI to show "Review Required" state
 * - Can be enhanced with LangGraph interrupt() in production
 */
export function createHitlCheckpointNode(observability: ObservabilityService) {
  return async function hitlCheckpointNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    // For M12 demo: Simple pass-through with logging
    // Production version would use LangGraph's interrupt() mechanism

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'HITL Checkpoint: Review required (auto-approving for demo)',
      {
        step: 'hitl_checkpoint',
        progress: 92,
        reviewRequired: true,
        autoApproved: true,
      },
    );

    // Check if there's an explicit approval/rejection in state
    // (Future enhancement: wait for external signal)
    const hitlDecision =
      (state as { hitlDecision?: string }).hitlDecision || 'approved';

    if (hitlDecision === 'rejected') {
      return {
        error: 'Analysis rejected by reviewing attorney',
        status: 'failed',
      };
    }

    // Approved - continue workflow
    return {
      // Add hitl approval metadata
      orchestration: {
        ...state.orchestration,
        hitlApproved: true,
        hitlApprovedAt: new Date().toISOString(),
      },
    };
  };
}

/**
 * Helper function to resume workflow after HITL approval
 * (For future production use with LangGraph interrupts)
 */
export function resumeAfterHitlApproval(
  threadId: string,
  taskId: string,
  approved: boolean,
  _observability: ObservabilityService,
): void {
  // This function would be called from an API endpoint
  // to resume the graph after attorney review

  // For now, just a placeholder
  console.log(
    `HITL Resume: threadId=${threadId}, taskId=${taskId}, approved=${approved}`,
  );

  // In production:
  // 1. Update state with approval decision
  // 2. Resume graph execution from checkpoint
  // 3. Emit continuation event via observability
}
