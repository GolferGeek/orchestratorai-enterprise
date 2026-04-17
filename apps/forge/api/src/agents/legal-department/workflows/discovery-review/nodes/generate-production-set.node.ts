/**
 * Discovery Review — Generate Production Set Node.
 *
 * Assembles the final production set from documents that are relevant AND
 * not privileged (after applying all batch reviewer corrections). Also builds
 * the privilege log for all withheld documents, and computes final review
 * statistics.
 *
 * Emits `dr:production_set_ready` with { documentCount, privilegeCount }.
 *
 * See: docs/efforts/current/discovery-document-review/plan.md §4.1–4.3
 */
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DiscoveryReviewState } from '../discovery-review.state';
import type {
  DocumentCoding,
  PrivilegeLogEntry,
  ReviewStatistics,
  BatchReviewDecisionPayload,
} from '../discovery-review.types';

/** Apply all reviewer corrections from batchDecisions onto the base documentCodings. */
function buildEffectiveCodings(
  documentCodings: Record<string, DocumentCoding>,
  batchDecisions: Record<string, BatchReviewDecisionPayload>,
): Record<string, DocumentCoding> {
  const effective: Record<string, DocumentCoding> = {};
  for (const [id, coding] of Object.entries(documentCodings)) {
    effective[id] = { ...coding };
  }

  for (const decision of Object.values(batchDecisions)) {
    for (const docDecision of decision.documentDecisions) {
      if (docDecision.action !== 'correct' || !docDecision.correctedCoding)
        continue;
      const original = effective[docDecision.documentId];
      if (!original) continue;
      const patch = docDecision.correctedCoding;
      effective[docDecision.documentId] = {
        ...original,
        relevance: patch.relevance
          ? { ...original.relevance, ...patch.relevance }
          : original.relevance,
        privilege: patch.privilege
          ? { ...original.privilege, ...patch.privilege }
          : original.privilege,
        issueTags: patch.issueTags ?? original.issueTags,
        hotDocument: patch.hotDocument ?? original.hotDocument,
        hotDocumentReason:
          patch.hotDocumentReason ?? original.hotDocumentReason,
      };
    }
  }

  return effective;
}

export function createGenerateProductionSetNode(
  observability: ObservabilityService,
) {
  return async function generateProductionSetNode(
    state: DiscoveryReviewState,
  ): Promise<Partial<DiscoveryReviewState>> {
    const ctx = state.executionContext;

    const effectiveCodings = buildEffectiveCodings(
      state.documentCodings,
      state.batchDecisions,
    );

    // Track which document IDs had reviewer corrections (for privilege log reviewerId).
    const reviewedDocIds = new Set<string>();
    for (const decision of Object.values(state.batchDecisions)) {
      for (const d of decision.documentDecisions) {
        reviewedDocIds.add(d.documentId);
      }
    }

    const productionSet: string[] = [];
    const privilegeLog: PrivilegeLogEntry[] = [];

    for (const docId of state.documentsCoded) {
      const coding = effectiveCodings[docId];
      if (!coding) continue;

      const isRelevant = coding.relevance.classification === 'relevant';
      const isNotPrivileged =
        coding.privilege.classification === 'not_privileged';
      const isPrivileged =
        coding.privilege.classification === 'privileged' ||
        coding.privilege.classification === 'potentially_privileged';

      if (isRelevant && isNotPrivileged) {
        productionSet.push(docId);
      }

      if (isPrivileged) {
        const indexEntry = state.documentIndex.find(
          (e) => e.documentId === docId,
        );
        privilegeLog.push({
          documentId: docId,
          documentName: indexEntry?.name ?? docId,
          privilegeType: coding.privilege.privilegeType,
          privilegeBasis: coding.privilege.reasoning,
          reviewerId: reviewedDocIds.has(docId) ? ctx.userId : undefined,
        });
      }
    }

    // Final review statistics (authoritative — overwrite the incremental stats).
    let humanCorrectionCount = 0;
    for (const decision of Object.values(state.batchDecisions)) {
      for (const d of decision.documentDecisions) {
        if (d.action === 'correct') humanCorrectionCount++;
      }
    }

    const relevanceBreakdown = {
      relevant: 0,
      not_relevant: 0,
      potentially_relevant: 0,
    };
    const issueDistribution: Record<string, number> = {};

    for (const docId of state.documentsCoded) {
      const coding = effectiveCodings[docId];
      if (!coding) continue;

      const cls = coding.relevance.classification;
      if (cls === 'relevant') relevanceBreakdown.relevant++;
      else if (cls === 'not_relevant') relevanceBreakdown.not_relevant++;
      else if (cls === 'potentially_relevant')
        relevanceBreakdown.potentially_relevant++;

      for (const tag of coding.issueTags) {
        if (tag.confidence > 0.5) {
          issueDistribution[tag.tagId] =
            (issueDistribution[tag.tagId] ?? 0) + 1;
        }
      }
    }

    const hotDocumentCount = Object.values(effectiveCodings).filter(
      (c) => c.hotDocument,
    ).length;

    const reviewStatistics: ReviewStatistics = {
      totalDocuments: state.documents.length,
      totalCoded: state.documentsCoded.length,
      totalFailed: Object.keys(state.documentsFailed).length,
      relevanceBreakdown,
      privilegeCount: privilegeLog.length,
      hotDocumentCount,
      issueDistribution,
      humanCorrectionCount,
      productionSetSize: productionSet.length,
    };

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Production set ready: ${productionSet.length} documents for production, ${privilegeLog.length} withheld for privilege`,
      {
        step: 'dr:production_set_ready',
        documentCount: productionSet.length,
        privilegeCount: privilegeLog.length,
      },
    );

    return {
      productionSet,
      privilegeLog,
      reviewStatistics,
      status: 'generating_production_set',
    };
  };
}
