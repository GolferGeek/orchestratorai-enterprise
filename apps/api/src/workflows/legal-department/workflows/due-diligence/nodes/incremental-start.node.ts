/**
 * Due Diligence Room — Incremental Start Node.
 *
 * Entry point for incremental updates. Skips intake (deal context already
 * validated), appends new document index entries for newly uploaded documents,
 * and sets the document queue to only the new document IDs.
 *
 * Existing perDocumentOutputs, runningFindings, and synthesis outputs are
 * preserved in state from the prior run — this node does not touch them.
 */
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DueDiligenceState } from '../due-diligence.state';
import type { DocumentIndexEntry } from '../due-diligence.types';

export function createIncrementalStartNode(
  observability: ObservabilityService,
) {
  return async function incrementalStartNode(
    state: DueDiligenceState,
  ): Promise<Partial<DueDiligenceState>> {
    const ctx = state.executionContext;
    const newIds = state.newDocumentIds;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Incremental update: ${newIds.length} new documents added to DD room`,
      { step: 'dd_incremental_start', progress: 2 },
    );

    // Clean up orphan index entries from prior failed attempts (entries
    // with null/undefined documentId) before appending new ones.
    const cleanedIndex = state.documentIndex.filter(
      (e) => e.documentId != null,
    );
    const existingDocIds = new Set(cleanedIndex.map((e) => e.documentId));

    // Build index entries for new documents only (skip if already indexed)
    const newEntries: DocumentIndexEntry[] = state.documents
      .filter(
        (doc) =>
          newIds.includes(doc.documentId) &&
          !existingDocIds.has(doc.documentId),
      )
      .map((doc) => ({
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

    const updatedIndex = [...cleanedIndex, ...newEntries];

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Incremental update initialized: ${newEntries.length} new documents queued, ${cleanedIndex.length} existing documents preserved`,
      {
        step: 'dd_incremental_start_complete',
        progress: 5,
        newDocuments: newEntries.length,
        existingDocuments: cleanedIndex.length,
        totalDocuments: updatedIndex.length,
      },
    );

    return {
      documentIndex: updatedIndex,
      documentQueue: [...newIds],
      status: 'classifying',
      startedAt: Date.now(),
    };
  };
}
