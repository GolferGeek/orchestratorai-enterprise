/**
 * Discovery Review — Protocol Validation Node.
 *
 * Validates that the ReviewProtocol contains the minimum required fields
 * before any expensive LLM calls are made. Fail-closed: missing required
 * fields transition the workflow to `failed` with a structured error message.
 *
 * Required fields:
 *   - matterId and matterName must be non-empty strings
 *   - relevanceCriteria.claims must have at least one entry
 *   - privilegeHolders.attorneys must have at least one entry
 *     (or privilegeReviewRequired must be false)
 *   - batchSize must be a positive integer
 *   - confidenceThreshold must be between 0 and 1 exclusive
 *
 * See: docs/efforts/current/discovery-document-review/plan.md §1.4
 */
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DiscoveryReviewState } from '../discovery-review.state';

export function createProtocolValidationNode(
  observability: ObservabilityService,
) {
  return async function protocolValidationNode(
    state: DiscoveryReviewState,
  ): Promise<Partial<DiscoveryReviewState>> {
    const ctx = state.executionContext;
    const p = state.reviewProtocol;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Validating review protocol',
      { step: 'dr_protocol_validation_start', progress: 2 },
    );

    const errors: string[] = [];

    if (!p.matterId || p.matterId.trim() === '') {
      errors.push('reviewProtocol.matterId is required');
    }
    if (!p.matterName || p.matterName.trim() === '') {
      errors.push('reviewProtocol.matterName is required');
    }
    if (
      !p.relevanceCriteria.claims ||
      p.relevanceCriteria.claims.length === 0
    ) {
      errors.push(
        'reviewProtocol.relevanceCriteria.claims must have at least one claim',
      );
    }
    if (
      p.privilegeReviewRequired &&
      (!p.privilegeHolders.attorneys ||
        p.privilegeHolders.attorneys.length === 0)
    ) {
      errors.push(
        'reviewProtocol.privilegeHolders.attorneys must have at least one entry when privilegeReviewRequired is true',
      );
    }
    if (!Number.isInteger(p.batchSize) || p.batchSize <= 0) {
      errors.push('reviewProtocol.batchSize must be a positive integer');
    }
    if (p.confidenceThreshold <= 0 || p.confidenceThreshold >= 1) {
      errors.push(
        'reviewProtocol.confidenceThreshold must be between 0 and 1 exclusive',
      );
    }

    if (errors.length > 0) {
      const errorMessage = `Review protocol validation failed: ${errors.join('; ')}`;
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
      `Protocol validated: matter "${p.matterName}" — ${p.relevanceCriteria.claims.length} claims, ${p.issueTags.length} issue tags`,
      {
        step: 'dr_protocol_validation_complete',
        progress: 3,
        matterId: p.matterId,
        matterName: p.matterName,
        claimsCount: p.relevanceCriteria.claims.length,
        issueTagsCount: p.issueTags.length,
      },
    );

    return { status: 'ingesting' };
  };
}
