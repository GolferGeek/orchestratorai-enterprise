/**
 * Deal Memo Generation — LangGraph Workflow.
 *
 * Phase 3 wiring:
 *   __start__
 *     → memo_intake
 *     → section_reps_warranties
 *     → section_indemnification
 *     → section_disclosure_schedules
 *     → section_conditions_precedent
 *     → section_covenants
 *     → memo_synthesis
 *     → memo_hitl_gate (interrupt — awaiting_review)
 *       approve → memo_finalize → complete
 *       reject  → memo_synthesis (with feedback in state.reviewerNotes)
 *       modify  → apply edits → memo_synthesis (re-stitch)
 *   Re-synthesis hard cap: 1 per decision (PRD §5 Reliability). After
 *   the cap, any further reject/modify falls through to finalize so the
 *   job cannot loop forever.
 *
 * Phase 4 extends finalize to write MD/DOCX artifacts; no graph change
 * needed.
 *
 * Each section node throws on LLM-parse failure or fabricated citations;
 * thrown errors propagate through LangGraph's error handler to the worker.
 * No silent fallbacks.
 *
 * See: docs/efforts/current/dd-deal-memo-generation/prd.md §4.1, §5.
 */
import { StateGraph, END, type CompiledStateGraph } from '@langchain/langgraph';
import {
  createMemoIntakeNode,
  type ParentStateReader,
} from './nodes/memo-intake.node';
import { createSectionRepsWarrantiesNode } from './nodes/section-reps-warranties.node';
import { createSectionIndemnificationNode } from './nodes/section-indemnification.node';
import { createSectionDisclosureSchedulesNode } from './nodes/section-disclosure-schedules.node';
import { createSectionConditionsPrecedentNode } from './nodes/section-conditions-precedent.node';
import { createSectionCovenantsNode } from './nodes/section-covenants.node';
import {
  createMemoSynthesisNode,
  applyModifyEdits,
} from './nodes/memo-synthesis.node';
import { createMemoHitlGateNode } from './nodes/memo-hitl-gate.node';
import { createMemoFinalizeNode } from './nodes/memo-finalize.node';
import { DealMemoStateAnnotation, type DealMemoState } from './deal-memo.state';
import type { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../shared/services/observability.service';
import type { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';
import type { LegalJobsRepository } from '../../jobs/legal-jobs.repository';
import type { DealMemoArtifactService } from './artifacts/deal-memo-artifact.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DealMemoGraph = CompiledStateGraph<any, any, any>;

/**
 * Hard cap on re-synthesis iterations. A reject or modify that has
 * already consumed one re-synthesis falls through to finalize on the
 * next gate pass — the reviewer can still request further iteration by
 * kicking off a fresh memo job. This is the no-infinite-loop guard
 * called out in the PRD Reliability section.
 */
const MAX_RESYNTHESIS = 1;

export async function createDealMemoGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
  jobsRepository: LegalJobsRepository,
  getParentState: ParentStateReader,
  artifactService: DealMemoArtifactService,
): Promise<DealMemoGraph> {
  const memoIntakeNode = createMemoIntakeNode(
    observability,
    jobsRepository,
    getParentState,
  );

  const sectionRepsWarranties = createSectionRepsWarrantiesNode(
    llmClient,
    observability,
  );
  const sectionIndemnification = createSectionIndemnificationNode(
    llmClient,
    observability,
  );
  const sectionDisclosureSchedules = createSectionDisclosureSchedulesNode(
    llmClient,
    observability,
  );
  const sectionConditionsPrecedent = createSectionConditionsPrecedentNode(
    llmClient,
    observability,
  );
  const sectionCovenants = createSectionCovenantsNode(llmClient, observability);

  const memoSynthesis = createMemoSynthesisNode(observability);
  const memoHitlGate = createMemoHitlGateNode(observability);
  const memoFinalize = createMemoFinalizeNode(observability, artifactService);

  /**
   * Post-decision routing node. Consumes state.lastDecision and either:
   *   - leaves state unchanged (approve or cap reached) — next edge routes
   *     to finalize;
   *   - threads reviewer feedback into reviewerNotes (reject) and bumps
   *     the resynthesis counter;
   *   - merges editedOutputs into sectionDrafts (modify) and bumps the
   *     resynthesis counter.
   *
   * Keeping the branching logic in a node (rather than the conditional
   * edge) means the state mutations happen inside the annotation reducer,
   * so they're checkpointed atomically with the routing decision.
   */
  async function applyReviewDecisionNode(
    state: DealMemoState,
  ): Promise<Partial<DealMemoState>> {
    const decision = state.lastDecision;
    if (!decision) return { pendingRoute: 'memo_finalize' };

    if (decision.decision === 'approve') {
      return { pendingRoute: 'memo_finalize' };
    }

    if (decision.decision !== 'reject' && decision.decision !== 'modify') {
      // deepen / redirect are out of scope for the memo HITL (PRD §6).
      // Treat as approve — UI should not send these for memo jobs.
      return { pendingRoute: 'memo_finalize' };
    }

    if (state.resynthesisCount >= MAX_RESYNTHESIS) {
      // Safety cap tripped — fall through to finalize. Log via the
      // observability plane so the decision to not re-synthesize is
      // traceable in the run history.
      await observability.emitProgress(
        state.executionContext,
        state.executionContext.conversationId,
        `Re-synthesis cap reached (${MAX_RESYNTHESIS}); finalizing despite ${decision.decision} decision`,
        {
          step: 'deal_memo_resynthesis_cap_reached',
          progress: 92,
          decision: decision.decision,
          resynthesisCount: state.resynthesisCount,
        },
      );
      return { pendingRoute: 'memo_finalize' };
    }

    if (decision.decision === 'reject') {
      // Thread the reviewer's feedback into reviewerNotes so the section
      // prompts see it on re-draft. We append to any existing notes so
      // the reviewer's context from the initial request is preserved.
      // Reject re-runs the five section nodes (the section prompts
      // already read reviewerNotes) and then re-synthesizes. Expensive
      // but it's the only way for reject feedback to actually change
      // the memo when synthesis is a deterministic stitch.
      const prevNotes = state.reviewerNotes ? `${state.reviewerNotes}\n\n` : '';
      return {
        reviewerNotes:
          prevNotes + `REJECT feedback (attorney review): ${decision.feedback}`,
        resynthesisCount: state.resynthesisCount + 1,
        pendingRoute: 'section_reps_warranties',
      };
    }

    // modify
    const currentDrafts = state.sectionDrafts ?? {};
    const nextDrafts = applyModifyEdits(
      currentDrafts,
      decision.editedOutputs ?? {},
    );
    const feedbackSuffix = decision.feedback
      ? ` feedback="${decision.feedback}"`
      : '';
    const prevNotes = state.reviewerNotes ? `${state.reviewerNotes}\n\n` : '';
    return {
      sectionDrafts: nextDrafts,
      reviewerNotes:
        prevNotes + `MODIFY applied (attorney review)${feedbackSuffix}`,
      resynthesisCount: state.resynthesisCount + 1,
      pendingRoute: 'memo_synthesis',
    };
  }

  async function completeNode(
    state: DealMemoState,
  ): Promise<Partial<DealMemoState>> {
    const ctx = state.executionContext;
    await observability.emitCompleted(
      ctx,
      ctx.conversationId,
      {
        documentCount: state.documentIndex.length,
        prunedForBudget: state.prunedForBudget,
        sectionsDrafted: Object.keys(state.sectionDrafts).length,
        memoLength: state.memoMarkdown?.length ?? 0,
        resynthesisCount: state.resynthesisCount,
      },
      Date.now() - state.startedAt,
    );
    return {
      status: state.status === 'failed' ? 'failed' : 'completed',
      completedAt: Date.now(),
    };
  }

  async function handleErrorNode(
    state: DealMemoState,
  ): Promise<Partial<DealMemoState>> {
    const ctx = state.executionContext;
    await observability.emitFailed(
      ctx,
      ctx.conversationId,
      state.error ?? 'Unknown error',
      Date.now() - state.startedAt,
    );
    return { status: 'failed' };
  }

  /**
   * Conditional edge after `apply_review_decision`: reads the explicit
   * routing hint the decision node set on state.
   */
  function routeAfterDecision(state: DealMemoState): string {
    return state.pendingRoute ?? 'memo_finalize';
  }

  const graph = new StateGraph(DealMemoStateAnnotation)
    .addNode('memo_intake', memoIntakeNode)
    .addNode('section_reps_warranties', sectionRepsWarranties)
    .addNode('section_indemnification', sectionIndemnification)
    .addNode('section_disclosure_schedules', sectionDisclosureSchedules)
    .addNode('section_conditions_precedent', sectionConditionsPrecedent)
    .addNode('section_covenants', sectionCovenants)
    .addNode('memo_synthesis', memoSynthesis)
    .addNode('memo_hitl_gate', memoHitlGate)
    .addNode('apply_review_decision', applyReviewDecisionNode)
    .addNode('memo_finalize', memoFinalize)
    .addNode('complete', completeNode)
    .addNode('handle_error', handleErrorNode)
    .addEdge('__start__', 'memo_intake')
    .addConditionalEdges('memo_intake', (state: DealMemoState) =>
      state.status === 'failed' ? 'handle_error' : 'section_reps_warranties',
    )
    .addEdge('section_reps_warranties', 'section_indemnification')
    .addEdge('section_indemnification', 'section_disclosure_schedules')
    .addEdge('section_disclosure_schedules', 'section_conditions_precedent')
    .addEdge('section_conditions_precedent', 'section_covenants')
    .addEdge('section_covenants', 'memo_synthesis')
    .addEdge('memo_synthesis', 'memo_hitl_gate')
    .addEdge('memo_hitl_gate', 'apply_review_decision')
    .addConditionalEdges('apply_review_decision', routeAfterDecision, {
      section_reps_warranties: 'section_reps_warranties',
      memo_synthesis: 'memo_synthesis',
      memo_finalize: 'memo_finalize',
    })
    .addEdge('memo_finalize', 'complete')
    .addEdge('handle_error', END)
    .addEdge('complete', END);

  return graph.compile({
    checkpointer: await checkpointer.getSaver(),
  }) as unknown as DealMemoGraph;
}
