/**
 * Discovery Review — Ingest Node.
 *
 * Reads documents from storage paths (`job.document_paths`) via
 * `LegalDocumentsStorageService`, populates `state.documents` with
 * decoded text content, and builds the initial `state.documentIndex`.
 *
 * The graph receives the document paths as an array on `state` input
 * (injected by `LegalDepartmentService.processDiscoveryReview` from the
 * job row's `document_paths` field). If the documents array is already
 * populated (e.g., tests pass content directly), ingest skips storage reads
 * and builds only the index.
 *
 * Failure handling: if reading or decoding a document fails, the document ID
 * is added to `state.documentsFailed` with the error message. Processing
 * continues for the remaining documents — failures are never silently dropped.
 *
 * Emits `dr:document_ingested` per document, and overall progress events.
 *
 * See: docs/efforts/current/discovery-document-review/plan.md §1.5
 */
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { LegalDocumentsStorageService } from '../../../jobs/legal-documents-storage.service';
import type { DiscoveryReviewState } from '../discovery-review.state';
import type { DocumentIndexEntry } from '../discovery-review.types';

export function createIngestNode(
  observability: ObservabilityService,
  documentsStorage: LegalDocumentsStorageService,
) {
  return async function ingestNode(
    state: DiscoveryReviewState,
  ): Promise<Partial<DiscoveryReviewState>> {
    const ctx = state.executionContext;

    // If documents are already populated (tests, direct invocation), skip
    // storage reads and proceed straight to index building.
    if (state.documents && state.documents.length > 0) {
      const documentIndex = buildInitialIndex(state.documents);
      const documentQueue = state.documents.map((d) => d.documentId);

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Ingest complete: ${state.documents.length} documents pre-loaded`,
        {
          step: 'dr:ingest_complete',
          progress: 8,
          documentCount: state.documents.length,
        },
      );

      return {
        documentIndex,
        documentQueue,
        documentsCoded: [],
        documentsFailed: {},
        status: 'classifying',
        reviewStatistics: {
          ...state.reviewStatistics,
          totalDocuments: state.documents.length,
        },
      };
    }

    // Load from storage paths (real job run).
    const storagePaths: string[] =
      ((state as unknown as Record<string, unknown>)
        .documentPaths as string[]) ?? [];

    if (storagePaths.length === 0) {
      const errorMessage =
        'No documents provided: state.documents is empty and no documentPaths were supplied.';
      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        errorMessage,
        Date.now() - state.startedAt,
      );
      return { status: 'failed', error: errorMessage };
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Ingesting ${storagePaths.length} documents from storage`,
      {
        step: 'dr_ingest_start',
        progress: 4,
        documentCount: storagePaths.length,
      },
    );

    const documents: DiscoveryReviewState['documents'] = [];
    const failed: Record<string, string> = {};

    for (let i = 0; i < storagePaths.length; i++) {
      const storagePath = storagePaths[i]!;
      const documentId = `doc-${String(i + 1).padStart(3, '0')}`;
      const name = storagePath.split('/').pop() ?? storagePath;

      try {
        const { data, contentType } =
          await documentsStorage.downloadOriginal(storagePath);
        const content = data.toString('utf8');

        documents.push({
          documentId,
          name,
          content,
          mimeType: contentType,
          sizeBytes: data.length,
        });

        await observability.emitProgress(
          ctx,
          ctx.conversationId,
          `Ingested document ${i + 1} of ${storagePaths.length}: ${name}`,
          {
            step: 'dr:document_ingested',
            progress: 4 + Math.round((i / storagePaths.length) * 4),
            documentId,
            documentName: name,
            current: i + 1,
            total: storagePaths.length,
          },
        );
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        failed[documentId] = `Ingest failed for ${name}: ${errMsg}`;

        await observability.emitProgress(
          ctx,
          ctx.conversationId,
          `Failed to ingest document ${i + 1}: ${name} — ${errMsg}`,
          {
            step: 'dr:document_ingest_failed',
            documentId,
            documentName: name,
            error: errMsg,
          },
        );
      }
    }

    if (documents.length === 0) {
      const errorMessage = `All ${storagePaths.length} documents failed to ingest. Check storage configuration.`;
      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        errorMessage,
        Date.now() - state.startedAt,
      );
      return { status: 'failed', error: errorMessage, documentsFailed: failed };
    }

    const documentIndex = buildInitialIndex(documents);
    const documentQueue = documents.map((d) => d.documentId);

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Ingest complete: ${documents.length} loaded, ${Object.keys(failed).length} failed`,
      {
        step: 'dr:ingest_complete',
        progress: 8,
        documentCount: documents.length,
        failedCount: Object.keys(failed).length,
      },
    );

    return {
      documents,
      documentIndex,
      documentQueue,
      documentsCoded: [],
      documentsFailed: failed,
      status: 'classifying',
      reviewStatistics: {
        ...state.reviewStatistics,
        totalDocuments: documents.length,
        totalFailed: Object.keys(failed).length,
      },
    };
  };
}

function buildInitialIndex(
  documents: DiscoveryReviewState['documents'],
): DocumentIndexEntry[] {
  return documents.map((doc) => ({
    documentId: doc.documentId,
    name: doc.name,
    documentType: 'unknown',
    date: null,
    summary: '',
    status: 'ingested' as const,
  }));
}
