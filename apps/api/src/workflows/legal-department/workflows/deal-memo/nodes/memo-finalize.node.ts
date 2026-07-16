/**
 * Deal Memo — Finalize Node.
 *
 * Terminal node after the attorney approves the memo at the HITL gate.
 *
 * Responsibilities:
 *  - Validate that `memoMarkdown` + every section draft is still present
 *    (guards against a modify-path that accidentally drops a section).
 *  - Persist the memo to the `legal-documents` bucket in two formats:
 *      {memoJobId}/deal-memo.md
 *      {memoJobId}/deal-memo.docx
 *  - Write the two bucket-relative paths onto state as `artifactPath` +
 *    `docxArtifactPath` so the worker's markCompleted spread can persist
 *    them onto the `result` JSONB.
 *  - Transition status to `finalizing`; the graph's `complete` node flips
 *    to `completed` and emits the observability summary.
 *
 * Failure behavior per project-root CLAUDE.md "NO FALLBACKS":
 *  - Any storage / conversion error propagates; the graph error handler
 *    catches it and transitions the job to `failed` with the original
 *    error message. No silent skip — a memo that finishes without both
 *    artifacts is a contract violation.
 *
 * See: docs/efforts/current/dd-deal-memo-generation/prd.md §4.1 (node 9)
 */
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { DealMemoState } from '../deal-memo.state';
import { SECTION_ORDER } from './shared/section-constants';
import type { DealMemoArtifactService } from '../artifacts/deal-memo-artifact.service';

export function createMemoFinalizeNode(
  observability: ObservabilityService,
  artifactService: DealMemoArtifactService,
) {
  return async function memoFinalizeNode(
    state: DealMemoState,
  ): Promise<Partial<DealMemoState>> {
    const ctx = state.executionContext;

    if (!state.memoMarkdown) {
      throw new Error(
        'memo_finalize reached with no memoMarkdown; synthesis must have run.',
      );
    }

    // Confirm every section still has a draft on state. If a modify edit
    // deleted one (shouldn't be possible — applyModifyEdits merges
    // rather than replacing), we fail loud.
    for (const id of SECTION_ORDER) {
      if (!state.sectionDrafts?.[id]) {
        throw new Error(
          `memo_finalize: section "${id}" is missing from sectionDrafts after review.`,
        );
      }
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Finalizing deal memo',
      {
        step: 'deal_memo_finalize_start',
        progress: 95,
        memoLength: state.memoMarkdown.length,
      },
    );

    // The memo job's id is NOT on state; we use the conversationId as the
    // artifact key so paths are deterministic and collision-free. This is
    // consistent with how the memo's LangGraph thread is keyed, and the
    // worker's legal-jobs repo 1:1 maps job.id ↔ job.conversation_id for
    // memo rows (see legal-jobs.controller.ts generateDealMemo).
    //
    // Keying on conversationId avoids coupling the graph to the HTTP
    // controller's job row shape — the node doesn't need to know the
    // job id, only that the artifact key is stable. The download
    // endpoint reads the stored path off the job row, so the two sides
    // stay connected without passing job.id through the workflow.
    const artifactKey = ctx.conversationId;

    // Upload in parallel; first to fail propagates. Errors surface with
    // the original storage/conversion message.
    const [artifactPath, docxArtifactPath] = await Promise.all([
      artifactService.uploadMemoMarkdown(artifactKey, state.memoMarkdown),
      artifactService.uploadMemoDocx(artifactKey, state.memoMarkdown),
    ]);

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Deal memo artifacts stored',
      {
        step: 'deal_memo_finalize_artifacts',
        progress: 97,
        artifactPath,
        docxArtifactPath,
      },
    );

    // Status moves to 'finalizing' here; the graph's `complete` node
    // flips to 'completed' and emits the final observability event.
    return {
      status: 'finalizing',
      artifactPath,
      docxArtifactPath,
    };
  };
}
