import type { DocumentsAgentState } from '../documents-agent.state';
import type { ObservabilityService } from '../../../../../shared/services/observability.service';

export function createDocsCompleteNode(observability: ObservabilityService) {
  return async function docsCompleteNode(
    state: DocumentsAgentState,
  ): Promise<Partial<DocumentsAgentState>> {
    const ctx = state.executionContext;
    const duration = Date.now() - state.startedAt;

    await observability.emitCompleted(
      ctx,
      ctx.conversationId,
      `Documents Agent complete: ${state.documentClass ?? 'unclassified'} document processed in ${duration}ms`,
    );

    return { status: 'completed' };
  };
}
