/**
 * Discovery Review — Build Batches Node.
 *
 * After the coding dispatch loop completes, this node partitions the coded
 * documents into prioritised review batches for the four HITL gates:
 *
 *   1. privilege          — docs where privilege.classification is
 *                           'privileged' or 'potentially_privileged'
 *   2. low_confidence_relevance — non-relevant docs below the protocol's
 *                           confidenceThreshold, sorted ascending by confidence
 *   3. hot_documents      — docs flagged hotDocument === true
 *   4. sample             — ~5% of high-confidence not_relevant docs (quality check)
 *
 * Empty batches are skipped (no ReviewBatch entry created).
 *
 * See: docs/efforts/current/discovery-document-review/plan.md §3.1
 */
import { randomUUID } from 'crypto';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DiscoveryReviewState } from '../discovery-review.state';
import type { ReviewBatch } from '../discovery-review.types';

const SAMPLE_FRACTION = 0.05;

export function createBuildBatchesNode(observability: ObservabilityService) {
  return async function buildBatchesNode(
    state: DiscoveryReviewState,
  ): Promise<Partial<DiscoveryReviewState>> {
    const ctx = state.executionContext;
    const codings = state.documentCodings;
    const protocol = state.reviewProtocol;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Building HITL review batches',
      { step: 'dr:build_batches_start' },
    );

    const batches: ReviewBatch[] = [];

    // ── 1. Privilege batch ──────────────────────────────────────────────────
    const privilegeIds = Object.values(codings)
      .filter(
        (c) =>
          c.privilege.classification === 'privileged' ||
          c.privilege.classification === 'potentially_privileged',
      )
      .map((c) => c.documentId);

    if (privilegeIds.length > 0) {
      const batch: ReviewBatch = {
        batchId: randomUUID(),
        batchType: 'privilege',
        documentIds: privilegeIds,
        status: 'pending',
      };
      batches.push(batch);
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Privilege batch ready: ${privilegeIds.length} documents`,
        {
          step: 'dr:batch_ready',
          batchId: batch.batchId,
          batchType: batch.batchType,
          documentCount: privilegeIds.length,
        },
      );
    }

    // ── 2. Low-confidence relevance batch ───────────────────────────────────
    const lowConfidenceIds = Object.values(codings)
      .filter(
        (c) =>
          c.relevance.classification !== 'relevant' &&
          c.relevance.confidence < protocol.confidenceThreshold,
      )
      .sort((a, b) => a.relevance.confidence - b.relevance.confidence)
      .map((c) => c.documentId);

    if (lowConfidenceIds.length > 0) {
      const batch: ReviewBatch = {
        batchId: randomUUID(),
        batchType: 'low_confidence_relevance',
        documentIds: lowConfidenceIds,
        status: 'pending',
      };
      batches.push(batch);
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Low-confidence batch ready: ${lowConfidenceIds.length} documents`,
        {
          step: 'dr:batch_ready',
          batchId: batch.batchId,
          batchType: batch.batchType,
          documentCount: lowConfidenceIds.length,
        },
      );
    }

    // ── 3. Hot documents batch ──────────────────────────────────────────────
    const hotDocIds = Object.values(codings)
      .filter((c) => c.hotDocument === true)
      .map((c) => c.documentId);

    if (hotDocIds.length > 0) {
      const batch: ReviewBatch = {
        batchId: randomUUID(),
        batchType: 'hot_documents',
        documentIds: hotDocIds,
        status: 'pending',
      };
      batches.push(batch);
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Hot documents batch ready: ${hotDocIds.length} documents`,
        {
          step: 'dr:batch_ready',
          batchId: batch.batchId,
          batchType: batch.batchType,
          documentCount: hotDocIds.length,
        },
      );
    }

    // ── 4. Random sample batch (~5% of high-confidence not_relevant) ────────
    const samplePool = Object.values(codings).filter(
      (c) =>
        c.relevance.classification === 'not_relevant' &&
        c.relevance.confidence >= protocol.confidenceThreshold,
    );

    const sampleSize = Math.max(
      1,
      Math.round(samplePool.length * SAMPLE_FRACTION),
    );
    const sampleIds: string[] = [];
    if (samplePool.length > 0) {
      // Fisher-Yates partial shuffle for the sample
      const pool = samplePool.map((c) => c.documentId);
      for (let i = 0; i < Math.min(sampleSize, pool.length); i++) {
        const j = i + Math.floor(Math.random() * (pool.length - i));
        const tmp = pool[i];
        pool[i] = pool[j]!;
        pool[j] = tmp!;
        sampleIds.push(pool[i]!);
      }
    }

    if (sampleIds.length > 0) {
      const batch: ReviewBatch = {
        batchId: randomUUID(),
        batchType: 'sample',
        documentIds: sampleIds,
        status: 'pending',
      };
      batches.push(batch);
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Sample batch ready: ${sampleIds.length} documents (${samplePool.length} pool)`,
        {
          step: 'dr:batch_ready',
          batchId: batch.batchId,
          batchType: batch.batchType,
          documentCount: sampleIds.length,
          poolSize: samplePool.length,
        },
      );
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Batches built: ${batches.length} batch(es) across ${batches.reduce((n, b) => n + b.documentIds.length, 0)} documents`,
      {
        step: 'dr:batches_built',
        batchCount: batches.length,
        batchTypes: batches.map((b) => b.batchType),
      },
    );

    return {
      reviewBatches: batches,
      status: 'building_batches',
    };
  };
}
