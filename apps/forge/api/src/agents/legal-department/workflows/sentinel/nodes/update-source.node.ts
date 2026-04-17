/**
 * Sentinel Ingest — Update Source Node.
 *
 * Updates sentinel_sources.last_polled_at on success,
 * or sets last_error on failure.
 */
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { SentinelRepository } from '../../../sentinel/sentinel.repository';
import type { SentinelIngestState } from '../sentinel-ingest.state';

export function createUpdateSourceNode(
  observability: ObservabilityService,
  repository: SentinelRepository,
) {
  return async function updateSourceNode(
    state: SentinelIngestState,
  ): Promise<Partial<SentinelIngestState>> {
    const ctx = state.executionContext;
    const source = state.sourceConfig;

    if (!source) {
      return {};
    }

    const lastError =
      state.status === 'failed' ? (state.error ?? 'Unknown error') : null;

    try {
      await repository.updateSourcePolled(source.id, lastError);

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        lastError
          ? `Source ${source.name} marked with error: ${lastError}`
          : `Source ${source.name} polled successfully`,
        {
          step: 'sentinel_update_source',
          progress: 90,
          sourceId: source.id,
          hasError: !!lastError,
        },
      );
    } catch (error) {
      // Don't fail the workflow if we can't update the source metadata
      const msg = error instanceof Error ? error.message : String(error);
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Failed to update source metadata: ${msg}`,
        { step: 'sentinel_update_source_error', error: msg },
      );
    }

    return {};
  };
}
