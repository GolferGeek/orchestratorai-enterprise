/**
 * Regulatory Compliance Audit — LangGraph Workflow.
 *
 * Complete flow:
 *   start → intake → ingest_policies → cross_reference_loop → evaluate_finding
 *   → [conditional: cross_reference_loop if queue not empty, else compute_scorecard]
 *   → compute_scorecard → hitl_gate → report_generation → complete
 *
 * See: docs/efforts/current/regulatory-compliance-audit/prd.md §4.1.1
 */
import { StateGraph, END, type CompiledStateGraph } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import {
  ComplianceAuditStateAnnotation,
  type ComplianceAuditState,
} from './compliance-audit.state';
import { createIntakeNode } from './nodes/intake.node';
import { createIngestPoliciesNode } from './nodes/ingest-policies.node';
import { createCrossReferenceLoopNode } from './nodes/cross-reference-loop.node';
import { createEvaluateFindingNode } from './nodes/evaluate-finding.node';
import { createComputeScorecardNode } from './nodes/compute-scorecard.node';
import { createHitlGateNode } from './nodes/hitl-gate.node';
import { createReportGenerationNode } from './nodes/report-generation.node';
import type { LLMHttpClientService } from '../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../shared/services/observability.service';
import type { PostgresCheckpointerService } from '../../../shared/persistence/postgres-checkpointer.service';
import type { WorkflowRagService } from '../../../shared/services/workflow-rag.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ComplianceAuditGraph = CompiledStateGraph<any, any, any>;

/** Stub evaluate node used when WorkflowRagService is not available. */
function stubEvaluateNode(obs: ObservabilityService) {
  return async function _stubEvaluateNode(
    state: ComplianceAuditState,
  ): Promise<Partial<ComplianceAuditState>> {
    const ctx = state.executionContext;
    const queue = [...state.evaluationQueue];
    const item = queue.shift();
    const itemId =
      item?.type === 'policy-section'
        ? item.sectionId
        : (item?.questionId ?? '');

    await obs.emitProgress(
      ctx,
      ctx.conversationId,
      `Evaluating: ${itemId} (RAG not available — skipping)`,
      { step: 'ca_evaluate_no_rag', progress: 40 },
    );

    return {
      evaluationQueue: queue,
      evaluationsCompleted: [...state.evaluationsCompleted, itemId],
    };
  };
}

export async function createComplianceAuditGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
  workflowRag?: WorkflowRagService,
): Promise<ComplianceAuditGraph> {
  const intakeNode = createIntakeNode(observability);
  const ingestPoliciesNode = createIngestPoliciesNode(llmClient, observability);
  const crossReferenceLoopNode = createCrossReferenceLoopNode(observability);
  const evaluateFindingNode = workflowRag
    ? createEvaluateFindingNode(llmClient, observability, workflowRag)
    : stubEvaluateNode(observability);
  const computeScorecardNode = createComputeScorecardNode(observability);
  const hitlGateNode = createHitlGateNode(observability);
  const reportGenerationNode = createReportGenerationNode(
    llmClient,
    observability,
  );

  // ── Helper nodes ──────────────────────────────────────────────────

  async function startNode(
    state: ComplianceAuditState,
  ): Promise<Partial<ComplianceAuditState>> {
    const ctx = state.executionContext;

    await observability.emitStarted(
      ctx,
      ctx.conversationId,
      `Starting Compliance Audit: ${state.documents.length} documents, mode=${state.auditContext.mode}, frameworks=[${state.auditContext.frameworkSlugs.join(', ')}]`,
    );

    return {
      status: 'intake',
      startedAt: Date.now(),
      messages: [
        new HumanMessage(
          `Compliance Audit: ${state.auditContext.mode} — ${state.auditContext.frameworkSlugs.join(', ')} — ${state.documents.length} documents`,
        ),
      ],
    };
  }

  async function completeNode(
    state: ComplianceAuditState,
  ): Promise<Partial<ComplianceAuditState>> {
    const ctx = state.executionContext;
    const duration = Date.now() - state.startedAt;

    if (state.status !== 'failed') {
      await observability.emitCompleted(
        ctx,
        ctx.conversationId,
        {
          totalDocuments: state.documents.length,
          policySections: state.policySections.length,
          findings: state.findings.length,
          mode: state.auditContext.mode,
        },
        duration,
      );
    }

    return {
      status: state.status === 'failed' ? 'failed' : 'completed',
      completedAt: Date.now(),
    };
  }

  async function handleErrorNode(
    state: ComplianceAuditState,
  ): Promise<Partial<ComplianceAuditState>> {
    const ctx = state.executionContext;

    await observability.emitFailed(
      ctx,
      ctx.conversationId,
      state.error ?? 'Unknown error',
      Date.now() - state.startedAt,
    );

    return { status: 'failed' };
  }

  // ── Build Graph ───────────────────────────────────────────────────

  const graph = new StateGraph(ComplianceAuditStateAnnotation)
    .addNode('start', startNode)
    .addNode('intake', intakeNode)
    .addNode('ingest_policies', ingestPoliciesNode)
    .addNode('cross_reference_loop', crossReferenceLoopNode)
    .addNode('evaluate_finding', evaluateFindingNode)
    .addNode('compute_scorecard', computeScorecardNode)
    .addNode('hitl_gate', hitlGateNode)
    .addNode('report_generation', reportGenerationNode)
    .addNode('complete', completeNode)
    .addNode('handle_error', handleErrorNode)
    .addEdge('__start__', 'start')
    .addEdge('start', 'intake')
    .addConditionalEdges('intake', (state: ComplianceAuditState) =>
      state.status === 'failed' ? 'handle_error' : 'ingest_policies',
    )
    .addConditionalEdges('ingest_policies', (state: ComplianceAuditState) =>
      state.evaluationQueue.length > 0
        ? 'cross_reference_loop'
        : 'compute_scorecard',
    )
    .addEdge('cross_reference_loop', 'evaluate_finding')
    // After evaluating: if queue has items → loop; else → scorecard
    .addConditionalEdges('evaluate_finding', (state: ComplianceAuditState) =>
      state.evaluationQueue.length > 0
        ? 'cross_reference_loop'
        : 'compute_scorecard',
    )
    // Scorecard → HITL gate
    .addEdge('compute_scorecard', 'hitl_gate')
    // HITL Gate → report_generation (approve/modify) or cross_reference_loop (reject)
    .addConditionalEdges('hitl_gate', (state: ComplianceAuditState) => {
      if (state.status === 'failed') return 'handle_error';
      if (state.status === 'evaluating') return 'cross_reference_loop';
      return 'report_generation';
    })
    // Report generation → complete
    .addConditionalEdges('report_generation', (state: ComplianceAuditState) =>
      state.status === 'failed' ? 'handle_error' : 'complete',
    )
    .addEdge('handle_error', END)
    .addEdge('complete', END);

  return graph.compile({
    checkpointer: await checkpointer.getSaver(),
  }) as unknown as ComplianceAuditGraph;
}
