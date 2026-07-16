import type { FactsAgentState } from '../facts-agent.state';
import type { ObservabilityService } from '../../../../../shared/services/observability.service';

export function createFactsCompleteNode(observability: ObservabilityService) {
  return async function completeNode(
    state: FactsAgentState,
  ): Promise<Partial<FactsAgentState>> {
    const ctx = state.executionContext;
    const duration = Date.now() - state.startedAt;

    await observability.emitCompleted(
      ctx,
      ctx.conversationId,
      `Facts Agent complete: ${state.entities.length} entities, ${state.timelineEntries.length} timeline entries extracted in ${duration}ms`,
    );

    return { status: 'completed' };
  };
}
