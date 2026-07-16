/**
 * Sentinel Ingest — Store Signals Node.
 *
 * Writes classified signals to legal.sentinel_signals and ingests
 * full_text into the sentinel-signals-{orgSlug} RAG collection.
 */
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { WorkflowRagService } from '../../../../shared/services/workflow-rag.service';
import type { SentinelRepository } from '../../../sentinel/sentinel.repository';
import type { SentinelIngestState } from '../sentinel-ingest.state';
import type { CreateSignalDto } from '../../../sentinel/sentinel.types';

export function createStoreSignalsNode(
  observability: ObservabilityService,
  repository: SentinelRepository,
  workflowRag?: WorkflowRagService,
) {
  return async function storeSignalsNode(
    state: SentinelIngestState,
  ): Promise<Partial<SentinelIngestState>> {
    const ctx = state.executionContext;
    const orgSlug = ctx.orgSlug;
    const classifiedSignals = state.classifiedSignals;
    const source = state.sourceConfig;

    if (classifiedSignals.length === 0) {
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'No new signals to store',
        { step: 'sentinel_store_skip', progress: 70 },
      );
      return { status: 'updating_source' };
    }

    if (!source) {
      return {
        status: 'failed',
        error: 'No source configuration — cannot store signals',
      };
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Storing ${classifiedSignals.length} signals to database`,
      { step: 'sentinel_store_start', progress: 60 },
    );

    // Build DTOs
    const dtos: CreateSignalDto[] = classifiedSignals.map((signal) => ({
      sourceId: source.id,
      title: signal.title,
      summary: signal.summary || undefined,
      fullText: signal.fullText || undefined,
      url: signal.url || undefined,
      publishedAt: signal.publishedAt || undefined,
      signalType: signal.signalType,
      jurisdictions: signal.jurisdictions,
      practiceAreas: signal.practiceAreas,
      contentHash: signal.contentHash,
    }));

    // Store to DB
    const stored = await repository.createSignalsBatch(orgSlug, dtos);

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Stored ${stored.length} signals. Ingesting into RAG...`,
      {
        step: 'sentinel_store_db_complete',
        progress: 70,
        storedCount: stored.length,
      },
    );

    // Ingest into RAG collection (best-effort — don't fail the workflow if RAG is unavailable)
    if (workflowRag) {
      try {
        // Access the underlying RAG storage service via the workflow wrapper
        const ragService = workflowRag as unknown as {
          ragStorage?: {
            getCollectionBySlug: (
              slug: string,
              orgSlug: string,
            ) => Promise<{ id: string } | null>;
            createCollection: (
              orgSlug: string,
              input: Record<string, unknown>,
            ) => Promise<{ id: string }>;
            insertDocument: (
              collectionId: string,
              orgSlug: string,
              input: Record<string, unknown>,
            ) => Promise<{ id: string }>;
            updateDocumentContent: (
              docId: string,
              orgSlug: string,
              content: string,
            ) => Promise<void>;
          };
        };

        if (ragService.ragStorage) {
          const collectionSlug = `sentinel-signals-${orgSlug}`;

          // Ensure collection exists
          let collection = await ragService.ragStorage.getCollectionBySlug(
            collectionSlug,
            orgSlug,
          );
          if (!collection) {
            collection = await ragService.ragStorage.createCollection(orgSlug, {
              name: `Sentinel Signals — ${orgSlug}`,
              slug: collectionSlug,
              description:
                'Ingested legal signals for sentinel cross-reference matching',
              embeddingModel: 'text-embedding-ada-002',
              embeddingDimensions: 1536,
              chunkSize: 1000,
              chunkOverlap: 200,
              createdBy: null,
            });
          }

          // Ingest each signal as a document
          for (const signal of stored) {
            if (!signal.full_text) continue;
            const doc = await ragService.ragStorage.insertDocument(
              collection.id,
              orgSlug,
              {
                filename: signal.title,
                fileType: 'text/plain',
                fileSize: new TextEncoder().encode(signal.full_text).length,
                fileHash: null,
                storagePath: null,
                createdBy: null,
                content: signal.full_text,
              },
            );
            await ragService.ragStorage.updateDocumentContent(
              doc.id,
              orgSlug,
              signal.full_text,
            );
          }

          await observability.emitProgress(
            ctx,
            ctx.conversationId,
            `RAG ingestion complete: ${stored.length} signals into ${collectionSlug}`,
            { step: 'sentinel_store_rag_complete', progress: 80 },
          );
        }
      } catch (ragError) {
        // Log but don't fail — signals are in the DB, RAG is supplementary
        const msg =
          ragError instanceof Error ? ragError.message : String(ragError);
        await observability.emitProgress(
          ctx,
          ctx.conversationId,
          `RAG ingestion failed (signals still stored in DB): ${msg}`,
          { step: 'sentinel_store_rag_error', error: msg },
        );
      }
    }

    return { status: 'updating_source' };
  };
}
