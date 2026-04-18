import type { FactsAgentState } from '../facts-agent.state';
import type { ObservabilityService } from '../../../../../shared/services/observability.service';
import type { MatterRepository } from '../../../../matter/matter.repository';

export function createUpdateKnowledgeNode(
  observability: ObservabilityService,
  matterRepo: MatterRepository,
) {
  return async function updateKnowledgeNode(
    state: FactsAgentState,
  ): Promise<Partial<FactsAgentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Facts Agent: updating knowledge summary and marking document processed',
      { step: 'facts_update_knowledge', progress: 80 },
    );

    try {
      // Build condensed prior knowledge summary for next invocation.
      // Structured entity list (not prose) keeps token count bounded.
      const entityLines = state.entities
        .slice(0, 50)
        .map(
          (e) => `[${e.entityType}] ${e.name}${e.role ? ` (${e.role})` : ''}`,
        )
        .join('\n');
      const priorKnowledgeSummary = entityLines || '';

      await matterRepo.setFactsProcessed(state.documentId, state.matterId);

      return { priorKnowledgeSummary };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await observability.emitFailed(ctx, ctx.conversationId, msg);
      return { status: 'failed', error: msg };
    }
  };
}
