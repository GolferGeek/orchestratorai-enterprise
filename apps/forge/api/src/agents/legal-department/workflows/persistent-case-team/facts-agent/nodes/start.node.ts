import type { FactsAgentState } from '../facts-agent.state';
import type { LegalDocumentsStorageService } from '../../../../jobs/legal-documents-storage.service';
import type { ObservabilityService } from '../../../../../shared/services/observability.service';

export function createFactsStartNode(
  storage: LegalDocumentsStorageService,
  observability: ObservabilityService,
) {
  return async function startNode(
    state: FactsAgentState,
  ): Promise<Partial<FactsAgentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Facts Agent: loading document ${state.documentId} for matter ${state.matterId}`,
      { step: 'facts_start', progress: 5 },
    );

    try {
      const { data } = await storage.downloadOriginal(state.storagePath);
      const documentContent = data.toString('utf-8');

      return { documentContent, status: 'processing' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await observability.emitFailed(ctx, ctx.conversationId, msg);
      return { status: 'failed', error: msg };
    }
  };
}
