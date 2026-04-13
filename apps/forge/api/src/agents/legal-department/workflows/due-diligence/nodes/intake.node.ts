/**
 * Due Diligence Room — Intake Node.
 *
 * Validates deal context, initializes the document index from uploaded
 * documents, sets documentQueue to all document IDs, and transitions
 * status to 'classifying'.
 *
 * See: docs/efforts/current/due-diligence-room/prd.md §4.1.1 (node 1)
 */
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DueDiligenceState } from '../due-diligence.state';
import type { DocumentIndexEntry } from '../due-diligence.types';

export function createIntakeNode(observability: ObservabilityService) {
  return async function intakeNode(
    state: DueDiligenceState,
  ): Promise<Partial<DueDiligenceState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Initializing DD room: ${state.documents.length} documents`,
      { step: 'dd_intake', progress: 2 },
    );

    // Validate deal context
    if (
      !state.dealContext.targetCompany ||
      !state.dealContext.transactionType
    ) {
      return {
        status: 'failed',
        error:
          'Deal context is incomplete: targetCompany and transactionType are required.',
      };
    }

    // Build document index entries from uploaded documents
    const documentIndex: DocumentIndexEntry[] = state.documents.map((doc) => ({
      documentId: doc.documentId,
      name: doc.name,
      documentType: 'unknown',
      parties: [],
      date: null,
      summary: '',
      riskScore: null,
      status: 'pending' as const,
      specialistsAssigned: [],
      specialistsCompleted: [],
    }));

    // Queue all documents for classification → analysis
    const documentQueue = state.documents.map((doc) => doc.documentId);

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `DD room initialized: ${documentIndex.length} documents queued for classification`,
      {
        step: 'dd_intake_complete',
        progress: 5,
        totalDocuments: documentIndex.length,
      },
    );

    return {
      documentIndex,
      documentQueue,
      documentsAnalyzed: [],
      documentsFailed: {},
      status: 'classifying',
    };
  };
}
