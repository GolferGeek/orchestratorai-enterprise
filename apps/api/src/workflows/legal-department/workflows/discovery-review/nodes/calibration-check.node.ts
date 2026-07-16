/**
 * Discovery Review — Calibration Check Node.
 *
 * Inspects the random sample batch decisions for systematic correction patterns.
 * A pattern is: the same correction direction (e.g. reviewer changed
 * `not_relevant` → `relevant`) appearing in ≥ PATTERN_THRESHOLD documents
 * within the sample batch.
 *
 * Detected patterns are appended to state.calibrationAdjustments so the
 * production-set generation phase can apply systematic corrections to the
 * full corpus.
 *
 * Emits `dr:calibration_applied` if adjustments were detected,
 *        `dr:calibration_skipped` if no patterns were found.
 *
 * See: docs/efforts/current/discovery-document-review/plan.md §3.6
 */
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DiscoveryReviewState } from '../discovery-review.state';
import type { CalibrationAdjustment } from '../discovery-review.types';

/** Minimum corrections in the same direction to constitute a systematic pattern. */
const PATTERN_THRESHOLD = 3;

export function createCalibrationCheckNode(
  observability: ObservabilityService,
) {
  return async function calibrationCheckNode(
    state: DiscoveryReviewState,
  ): Promise<Partial<DiscoveryReviewState>> {
    const ctx = state.executionContext;

    // Find the sample batch decision (if any)
    const sampleBatch = state.reviewBatches.find(
      (b) => b.batchType === 'sample',
    );

    if (!sampleBatch) {
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Calibration check skipped: no sample batch',
        { step: 'dr:calibration_skipped', reason: 'no_sample_batch' },
      );
      return { status: 'calibrating' };
    }

    const sampleDecision = state.batchDecisions[sampleBatch.batchId];
    if (!sampleDecision) {
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Calibration check skipped: no sample batch decision found',
        { step: 'dr:calibration_skipped', reason: 'no_decision' },
      );
      return { calibrationAdjustments: [], status: 'calibrating' };
    }

    // Only inspect `correct` actions — `approve` actions confirm system coding.
    const corrections = sampleDecision.documentDecisions.filter(
      (d) => d.action === 'correct',
    );

    if (corrections.length === 0) {
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Calibration check: no corrections in sample — coding quality confirmed',
        { step: 'dr:calibration_skipped', reason: 'no_corrections' },
      );
      return { calibrationAdjustments: [], status: 'calibrating' };
    }

    // Count correction patterns: direction = `${fromClassification}→${toClassification}`
    const patternCounts = new Map<
      string,
      { fromClassification: string; toClassification: string; count: number }
    >();

    for (const docDecision of corrections) {
      const originalCoding = state.documentCodings[docDecision.documentId];
      if (!originalCoding) continue;

      // Relevance correction pattern
      if (docDecision.correctedCoding?.relevance) {
        const from = originalCoding.relevance.classification;
        const to = docDecision.correctedCoding.relevance.classification;
        if (from && to && from !== to) {
          const key = `relevance:${from}→${to}`;
          const existing = patternCounts.get(key) ?? {
            fromClassification: from,
            toClassification: to,
            count: 0,
          };
          patternCounts.set(key, { ...existing, count: existing.count + 1 });
        }
      }

      // Privilege correction pattern
      if (docDecision.correctedCoding?.privilege) {
        const from = originalCoding.privilege.classification;
        const to = docDecision.correctedCoding.privilege.classification;
        if (from && to && from !== to) {
          const key = `privilege:${from}→${to}`;
          const existing = patternCounts.get(key) ?? {
            fromClassification: from,
            toClassification: to,
            count: 0,
          };
          patternCounts.set(key, { ...existing, count: existing.count + 1 });
        }
      }
    }

    // Extract patterns that meet the threshold
    const adjustments: CalibrationAdjustment[] = [];
    for (const [
      key,
      { fromClassification, toClassification, count },
    ] of patternCounts) {
      if (count >= PATTERN_THRESHOLD) {
        const type = key.startsWith('relevance:')
          ? `relevance_correction_${fromClassification}_to_${toClassification}`
          : `privilege_correction_${fromClassification}_to_${toClassification}`;

        adjustments.push({
          type,
          fromClassification,
          toClassification,
          count,
        });
      }
    }

    if (adjustments.length > 0) {
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Calibration: ${adjustments.length} systematic pattern(s) detected — ${adjustments.map((a) => `${a.fromClassification}→${a.toClassification} (${a.count}x)`).join(', ')}`,
        {
          step: 'dr:calibration_applied',
          adjustmentCount: adjustments.length,
          adjustments,
        },
      );
    } else {
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Calibration check: ${corrections.length} corrections found but no systematic patterns (threshold: ${PATTERN_THRESHOLD})`,
        {
          step: 'dr:calibration_skipped',
          reason: 'below_threshold',
          correctionCount: corrections.length,
          threshold: PATTERN_THRESHOLD,
        },
      );
      return {
        calibrationAdjustments: [],
        status: 'calibrating',
      };
    }

    return {
      calibrationAdjustments: adjustments,
      status: 'calibrating',
    };
  };
}
