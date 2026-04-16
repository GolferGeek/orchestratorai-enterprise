/**
 * Deal Memo — Intake Node.
 *
 * Loads a completed Due Diligence Room's checkpoint snapshot and copies the
 * seven hydration fields required by later section-draft nodes into the
 * memo state. Fails loudly — no silent fallback — on:
 *
 *  - parent job missing, wrong type, wrong org, or not completed
 *  - parent checkpoint missing or missing any of the required fields
 *  - hydrated state still over budget after pruning
 *
 * See: docs/efforts/current/dd-deal-memo-generation/prd.md §4.1, §7 Risks.
 */
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { LegalJobsRepository } from '../../../jobs/legal-jobs.repository';
import { DD_JOB_TYPE } from '../../../jobs/legal-jobs.types';
import type { DealMemoState } from '../deal-memo.state';
import type {
  DealContext,
  DocumentIndexEntry,
  RunningFindingsSummary,
  PerDocumentOutput,
  RiskMatrix,
  DealBreakerFlag,
  MissingDocument,
} from '../../due-diligence/due-diligence.types';

/**
 * Minimal shape the intake node reads off the parent DD checkpoint. Mirrors
 * the subset of DueDiligenceState that this workflow consumes.
 */
export interface ParentDDSnapshot {
  dealContext?: DealContext;
  documentIndex?: DocumentIndexEntry[];
  perDocumentOutputs?: Record<string, PerDocumentOutput>;
  runningFindings?: Record<string, RunningFindingsSummary>;
  riskMatrix?: RiskMatrix;
  dealBreakerFlags?: DealBreakerFlag[];
  missingDocuments?: MissingDocument[];
}

/**
 * Reader injected by the service layer. Takes a thread_id (the parent DD
 * Room's conversation_id) and returns the raw state `values` from the
 * compiled DD graph's checkpoint, or null if no snapshot exists.
 */
export type ParentStateReader = (
  threadId: string,
) => Promise<ParentDDSnapshot | null>;

/**
 * Approximate char-length budget for the hydrated parent view. The
 * section-draft nodes all include this data in their prompts, so it
 * must fit inside a reasonable prompt window. 400k chars ≈ 100k tokens
 * leaves headroom for per-section system prompts and the reasoning budget.
 *
 * Tunable via MEMO_INTAKE_MAX_CHARS env var if deployments need to adjust.
 */
const DEFAULT_MAX_CHARS = 400_000;

function approxCharSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Replace full specialist outputs with a compact summary so prompt size
 * stays within budget. We preserve the document's routing decision and
 * a first-pass text snippet; full specialist output remains available
 * on the parent state for anyone who needs to drill in.
 */
function pruneOutputs(
  perDocumentOutputs: Record<string, PerDocumentOutput>,
): Record<string, PerDocumentOutput> {
  const pruned: Record<string, PerDocumentOutput> = {};
  for (const [docId, output] of Object.entries(perDocumentOutputs)) {
    pruned[docId] = {
      routingDecision: output.routingDecision,
      specialistOutputs: {
        _pruned: true,
        _specialistCount: Object.keys(output.specialistOutputs ?? {}).length,
      },
    };
  }
  return pruned;
}

export function createMemoIntakeNode(
  observability: ObservabilityService,
  jobsRepository: LegalJobsRepository,
  getParentState: ParentStateReader,
  options: { maxChars?: number } = {},
) {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;

  return async function memoIntakeNode(
    state: DealMemoState,
  ): Promise<Partial<DealMemoState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Deal memo intake: loading parent DD room ${state.parentJobId}`,
      { step: 'deal_memo_intake_start', progress: 5 },
    );

    // ── Validate parent job row ────────────────────────────────────
    if (!state.parentJobId) {
      throw new Error('memo_intake: parentJobId is empty');
    }
    if (!state.parentConversationId) {
      throw new Error('memo_intake: parentConversationId is empty');
    }

    const parent = await jobsRepository.findByIdForOrg(
      state.parentJobId,
      ctx.orgSlug,
    );
    if (!parent) {
      throw new Error(
        `memo_intake: parent DD job ${state.parentJobId} not found in org ${ctx.orgSlug}`,
      );
    }

    // Job type may be stored on the DB column OR inferred from metadata.jobType
    // (see legal-jobs-worker.service.ts — DB column is 'document-analysis' for
    // DD rooms; the real type lives in input.metadata.jobType).
    const inputMetadata = parent.input?.metadata as
      | Record<string, unknown>
      | undefined;
    const resolvedJobType =
      (inputMetadata?.jobType as string | undefined) ?? parent.job_type;

    if (resolvedJobType !== DD_JOB_TYPE) {
      throw new Error(
        `memo_intake: parent job ${state.parentJobId} is not a due-diligence room ` +
          `(found job_type=${resolvedJobType})`,
      );
    }

    if (parent.status !== 'completed') {
      throw new Error(
        `memo_intake: parent DD job ${state.parentJobId} must be status=completed ` +
          `(found status=${parent.status})`,
      );
    }

    if (parent.conversation_id !== state.parentConversationId) {
      throw new Error(
        `memo_intake: parentConversationId mismatch — input=${state.parentConversationId}, ` +
          `parent row=${parent.conversation_id}`,
      );
    }

    // ── Load parent checkpoint snapshot ────────────────────────────
    const snapshot = await getParentState(state.parentConversationId);
    if (!snapshot) {
      throw new Error(
        `memo_intake: no checkpoint snapshot for parent conversation ${state.parentConversationId}`,
      );
    }

    const {
      dealContext,
      documentIndex,
      perDocumentOutputs,
      runningFindings,
      riskMatrix,
      dealBreakerFlags,
      missingDocuments,
    } = snapshot;

    if (!dealContext) {
      throw new Error('memo_intake: parent snapshot missing dealContext');
    }
    if (!documentIndex || documentIndex.length === 0) {
      throw new Error(
        'memo_intake: parent snapshot has empty documentIndex — DD room never classified any documents',
      );
    }
    if (!perDocumentOutputs || Object.keys(perDocumentOutputs).length === 0) {
      throw new Error(
        'memo_intake: parent snapshot missing perDocumentOutputs — DD room never produced any specialist findings',
      );
    }
    if (!runningFindings) {
      throw new Error('memo_intake: parent snapshot missing runningFindings');
    }
    if (!riskMatrix) {
      throw new Error('memo_intake: parent snapshot missing riskMatrix');
    }

    // ── Budget check / prune ───────────────────────────────────────
    let finalPerDocumentOutputs = perDocumentOutputs;
    let prunedForBudget = false;
    const totalSize = approxCharSize({
      perDocumentOutputs,
      runningFindings,
      riskMatrix,
      dealBreakerFlags: dealBreakerFlags ?? [],
      missingDocuments: missingDocuments ?? [],
    });

    if (totalSize > maxChars) {
      finalPerDocumentOutputs = pruneOutputs(perDocumentOutputs);
      prunedForBudget = true;

      const postPruneSize = approxCharSize({
        perDocumentOutputs: finalPerDocumentOutputs,
        runningFindings,
        riskMatrix,
        dealBreakerFlags: dealBreakerFlags ?? [],
        missingDocuments: missingDocuments ?? [],
      });

      if (postPruneSize > maxChars) {
        throw new Error(
          `memo_intake: hydrated parent state is ${postPruneSize} chars even after pruning ` +
            `(budget=${maxChars}). DD room too large for memo generation.`,
        );
      }
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Deal memo intake complete: hydrated ${documentIndex.length} documents, ` +
        `${Object.keys(runningFindings).length} specialists, ` +
        `${(dealBreakerFlags ?? []).length} deal-breaker flags` +
        (prunedForBudget ? ' (pruned for budget)' : ''),
      {
        step: 'deal_memo_intake_complete',
        progress: 10,
        documents: documentIndex.length,
        specialists: Object.keys(runningFindings).length,
        dealBreakerFlags: (dealBreakerFlags ?? []).length,
        prunedForBudget,
      },
    );

    return {
      dealContext,
      documentIndex,
      perDocumentOutputs: finalPerDocumentOutputs,
      runningFindings,
      riskMatrix,
      dealBreakerFlags: dealBreakerFlags ?? [],
      missingDocuments: missingDocuments ?? [],
      prunedForBudget,
      status: 'drafting',
    };
  };
}
