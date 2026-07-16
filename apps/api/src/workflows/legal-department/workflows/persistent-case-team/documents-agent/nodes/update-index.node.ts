import type { DocumentsAgentState } from '../documents-agent.state';
import type { ObservabilityService } from '../../../../../shared/services/observability.service';
import type { MatterRepository } from '../../../../matter/matter.repository';

export function createUpdateIndexNode(
  observability: ObservabilityService,
  matterRepo: MatterRepository,
) {
  return async function updateIndexNode(
    state: DocumentsAgentState,
  ): Promise<Partial<DocumentsAgentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Documents Agent: marking document classified',
      { step: 'docs_update_index', progress: 85 },
    );

    try {
      await matterRepo.setDocsProcessed(state.documentId, state.matterId);
      return {};
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await observability.emitFailed(ctx, ctx.conversationId, msg);
      return { status: 'failed', error: msg };
    }
  };
}
