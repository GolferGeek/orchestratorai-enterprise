/**
 * Deal Memo — HITL Gate (single review checkpoint).
 *
 * Presents the synthesized memo plus per-section drafts and citations
 * to the reviewing attorney via LangGraph `interrupt()`. On resume, the
 * decision payload is written to `state.lastDecision` and the graph's
 * conditional edge routes based on `decision.decision`:
 *
 *   approve → finalize
 *   reject  → synthesis (with reviewerNotes feedback threaded in)
 *   modify  → synthesis after editedOutputs merged into sectionDrafts
 *
 * Unsupported decisions (`deepen`, `redirect`) are treated as approve —
 * the PRD scopes this gate to approve/reject/modify. If the UI ever
 * starts sending those, we surface them cleanly rather than throwing
 * (the reviewer isn't at fault for a UI regression).
 *
 * See: docs/efforts/current/dd-deal-memo-generation/prd.md §4.1 (node 8)
 */
import { interrupt } from '@langchain/langgraph';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { ReviewDecisionPayload } from '../../../jobs/legal-jobs.types';
import type { DealMemoState } from '../deal-memo.state';
import type {
  DealMemoReviewPayload,
  CitationRef,
  SectionId,
} from '../deal-memo.types';
import { SECTION_ORDER } from './shared/section-constants';

export function createMemoHitlGateNode(observability: ObservabilityService) {
  return async function memoHitlGateNode(
    state: DealMemoState,
  ): Promise<Partial<DealMemoState>> {
    const ctx = state.executionContext;

    if (!state.memoMarkdown) {
      throw new Error(
        'memo_hitl_gate reached with no memoMarkdown; synthesis must run first.',
      );
    }

    const sectionDrafts = state.sectionDrafts;
    const sectionCitations = SECTION_ORDER.reduce(
      (acc, id) => {
        acc[id] = sectionDrafts[id]?.citations ?? [];
        return acc;
      },
      {} as Record<SectionId, CitationRef[]>,
    );

    const reviewPayload: DealMemoReviewPayload = {
      gate: 'deal-memo',
      dealStructure: state.dealStructure,
      memoMarkdown: state.memoMarkdown,
      sectionDrafts,
      sectionCitations,
    };

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'HITL: awaiting attorney review of deal memo',
      {
        step: 'deal_memo_hitl_start',
        progress: 90,
        reviewRequired: true,
        resynthesisCount: state.resynthesisCount,
      },
    );

    // interrupt() throws GraphInterrupt on first entry; the worker marks
    // the job row as awaiting_review and releases the slot. When the
    // reviewer posts a decision the graph resumes here and interrupt()
    // returns the decision payload.
    const decision = interrupt<DealMemoReviewPayload, ReviewDecisionPayload>(
      reviewPayload,
    );

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `HITL: decision=${decision.decision}`,
      {
        step: 'deal_memo_hitl_complete',
        progress: 91,
        decision: decision.decision,
        resynthesisCount: state.resynthesisCount,
      },
    );

    // Status on resume: the worker sets 'awaiting_review' in the DB row
    // when interrupt() first throws; once we come back here, we're moving
    // forward again. The next node (finalize or synthesis on re-entry) will
    // override status — we pick 'synthesizing' as a neutral "back to work"
    // signal so any mid-flight DB observation is accurate.
    return {
      reviewPayload,
      lastDecision: decision,
      status: 'synthesizing',
    };
  };
}
