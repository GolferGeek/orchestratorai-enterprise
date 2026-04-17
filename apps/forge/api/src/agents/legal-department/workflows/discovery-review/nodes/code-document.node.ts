/**
 * Discovery Review — Code Document Node.
 *
 * Orchestrates the four coding passes for the document at state.currentDocumentId:
 *   1. relevance
 *   2. privilege
 *   3. issueTags
 *   4. hotDocument (conditional on relevance + privilege)
 *
 * On success: writes DocumentCoding to state.documentCodings, moves ID to
 * documentsCoded, updates documentIndex entry to 'coded', emits
 * 'dr:document_coded', and updates reviewStatistics incrementally.
 *
 * On any error: writes ID + error message to state.documentsFailed, continues
 * (never throws). Updates reviewStatistics.totalFailed.
 *
 * See: docs/efforts/current/discovery-document-review/plan.md §2.6
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DiscoveryReviewState } from '../discovery-review.state';
import type {
  DocumentCoding,
  ReviewStatistics,
} from '../discovery-review.types';
import { codeRelevance } from './code-document/relevance';
import { codePrivilege } from './code-document/privilege';
import { codeIssues } from './code-document/issues';
import { codeHotDocument } from './code-document/hot-document';

/**
 * Recompute ReviewStatistics from the full documentCodings map and
 * documentsFailed count. Called after each document is coded.
 */
function computeStatistics(
  codings: Record<string, DocumentCoding>,
  documentsFailed: Record<string, string>,
  totalDocuments: number,
): ReviewStatistics {
  const codingValues = Object.values(codings);
  const totalCoded = codingValues.length;
  const totalFailed = Object.keys(documentsFailed).length;

  const relevanceBreakdown = {
    relevant: 0,
    not_relevant: 0,
    potentially_relevant: 0,
  };
  let privilegeCount = 0;
  let hotDocumentCount = 0;
  const issueDistribution: Record<string, number> = {};

  for (const coding of codingValues) {
    relevanceBreakdown[coding.relevance.classification] += 1;

    if (
      coding.privilege.classification === 'privileged' ||
      coding.privilege.classification === 'potentially_privileged'
    ) {
      privilegeCount += 1;
    }

    if (coding.hotDocument) {
      hotDocumentCount += 1;
    }

    for (const tag of coding.issueTags) {
      issueDistribution[tag.tagId] = (issueDistribution[tag.tagId] ?? 0) + 1;
    }
  }

  return {
    totalDocuments,
    totalCoded,
    totalFailed,
    relevanceBreakdown,
    privilegeCount,
    hotDocumentCount,
    issueDistribution,
    humanCorrectionCount: 0,
    productionSetSize: 0,
  };
}

export function createCodeDocumentNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function codeDocumentNode(
    state: DiscoveryReviewState,
  ): Promise<Partial<DiscoveryReviewState>> {
    const documentId = state.currentDocumentId;
    if (!documentId) {
      // Should never happen — dispatch_loop always sets currentDocumentId
      // before routing here, but guard defensively.
      return {};
    }

    const ctx = state.executionContext;
    const doc = state.documents.find((d) => d.documentId === documentId);

    if (!doc) {
      // Document missing from state — log to failed and continue.
      const newFailed = {
        [documentId]: `Document not found in state: ${documentId}`,
      };
      const updatedFailed = { ...state.documentsFailed, ...newFailed };
      return {
        documentsFailed: newFailed,
        currentDocumentId: undefined,
        reviewStatistics: computeStatistics(
          state.documentCodings,
          updatedFailed,
          state.documents.length,
        ),
      };
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Coding document: ${doc.name}`,
      {
        step: 'dr_coding_document',
        documentId,
        documentName: doc.name,
        totalCoded: state.documentsCoded.length,
        totalDocuments: state.documents.length,
      },
    );

    try {
      // 1. Relevance
      const relevance = await codeRelevance(
        doc,
        state.reviewProtocol,
        llmClient,
        ctx,
      );

      // 2. Privilege
      const privilege = await codePrivilege(
        doc,
        state.reviewProtocol,
        llmClient,
        ctx,
      );

      // 3. Issue tags
      const issueTags = await codeIssues(
        doc,
        state.reviewProtocol,
        llmClient,
        ctx,
      );

      // 4. Hot document (conditional)
      const hotDocResult = await codeHotDocument(
        doc,
        relevance,
        privilege,
        state.reviewProtocol,
        llmClient,
        ctx,
      );

      const coding: DocumentCoding = {
        documentId,
        relevance,
        privilege,
        issueTags,
        hotDocument: hotDocResult.hotDocument,
        hotDocumentReason: hotDocResult.hotDocumentReason,
      };

      // Update documentIndex entry to 'coded'
      const updatedDocumentIndex = state.documentIndex.map((entry) =>
        entry.documentId === documentId
          ? { ...entry, status: 'coded' as const }
          : entry,
      );

      const updatedCodings = { ...state.documentCodings, [documentId]: coding };
      const updatedCoded = [...state.documentsCoded, documentId];
      const updatedStats = computeStatistics(
        updatedCodings,
        state.documentsFailed,
        state.documents.length,
      );

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Coded document: ${doc.name} — ${relevance.classification}`,
        {
          step: 'dr:document_coded',
          documentId,
          documentName: doc.name,
          relevanceClassification: relevance.classification,
          privilegeClassification: privilege.classification,
          hotDocument: hotDocResult.hotDocument,
          totalCoded: updatedCoded.length,
          totalDocuments: state.documents.length,
        },
      );

      return {
        documentCodings: { [documentId]: coding },
        documentsCoded: updatedCoded,
        documentIndex: updatedDocumentIndex,
        reviewStatistics: updatedStats,
        currentDocumentId: undefined,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);

      // Update documentIndex entry to 'failed'
      const updatedDocumentIndex = state.documentIndex.map((entry) =>
        entry.documentId === documentId
          ? { ...entry, status: 'failed' as const, error: errMsg }
          : entry,
      );

      const newFailed = { [documentId]: errMsg };
      const updatedFailed = { ...state.documentsFailed, ...newFailed };
      const updatedStats = computeStatistics(
        state.documentCodings,
        updatedFailed,
        state.documents.length,
      );

      await observability
        .emitProgress(
          ctx,
          ctx.conversationId,
          `Failed to code document: ${doc.name} — ${errMsg}`,
          {
            step: 'dr:document_coding_failed',
            documentId,
            documentName: doc.name,
            error: errMsg,
          },
        )
        .catch(() => {
          // Swallow observability errors — the coding failure is the important signal.
        });

      return {
        documentsFailed: newFailed,
        documentIndex: updatedDocumentIndex,
        reviewStatistics: updatedStats,
        currentDocumentId: undefined,
      };
    }
  };
}
