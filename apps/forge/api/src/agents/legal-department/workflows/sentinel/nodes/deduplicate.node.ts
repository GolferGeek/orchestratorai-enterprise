/**
 * Sentinel Ingest — Deduplicate Node.
 *
 * Queries existing content hashes in sentinel_signals for the org
 * and filters out items that have already been ingested.
 */
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { SentinelRepository } from '../../../sentinel/sentinel.repository';
import type { SentinelIngestState } from '../sentinel-ingest.state';

export function createDeduplicateNode(
  observability: ObservabilityService,
  repository: SentinelRepository,
) {
  return async function deduplicateNode(
    state: SentinelIngestState,
  ): Promise<Partial<SentinelIngestState>> {
    const ctx = state.executionContext;
    const orgSlug = ctx.orgSlug;
    const rawItems = state.rawItems;

    if (rawItems.length === 0) {
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'No items to deduplicate — source returned empty',
        { step: 'sentinel_dedup_empty', progress: 30 },
      );
      return {
        newSignals: [],
        status: 'classifying',
      };
    }

    const hashes = rawItems.map((item) => item.contentHash);
    const existingHashes = await repository.getExistingHashes(orgSlug, hashes);

    const newSignals = rawItems.filter(
      (item) => !existingHashes.has(item.contentHash),
    );

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Deduplication: ${rawItems.length} fetched, ${existingHashes.size} already exist, ${newSignals.length} new`,
      {
        step: 'sentinel_dedup_complete',
        progress: 30,
        totalFetched: rawItems.length,
        alreadyExists: existingHashes.size,
        newCount: newSignals.length,
      },
    );

    return {
      newSignals,
      status: 'classifying',
    };
  };
}
