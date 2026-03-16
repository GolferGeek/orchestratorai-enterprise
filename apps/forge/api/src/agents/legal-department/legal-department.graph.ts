import { StateGraph, END, CompiledStateGraph } from '@langchain/langgraph';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import {
  LegalDepartmentStateAnnotation,
  LegalDepartmentState,
} from './legal-department.state';
import { createEchoNode } from './nodes/echo.node';
import { createContractAgentNode } from './nodes/contract-agent.node';
import { createComplianceAgentNode } from './nodes/compliance-agent.node';
import { createIpAgentNode } from './nodes/ip-agent.node';
import { createPrivacyAgentNode } from './nodes/privacy-agent.node';
import { createEmploymentAgentNode } from './nodes/employment-agent.node';
import { createCorporateAgentNode } from './nodes/corporate-agent.node';
import { createLitigationAgentNode } from './nodes/litigation-agent.node';
import { createRealEstateAgentNode } from './nodes/real-estate-agent.node';
import { createCloRoutingNode } from './nodes/clo-routing.node';
import { createOrchestratorNode } from './nodes/orchestrator.node';
import { createSynthesisNode } from './nodes/synthesis.node';
import { createHitlCheckpointNode } from './nodes/hitl-checkpoint.node';
import { createReportGenerationNode } from './nodes/report-generation.node';
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';

const _AGENT_SLUG = 'legal-department';

// Using CompiledStateGraph with broad generics to avoid TS2589 type
// instantiation depth limit caused by deeply nested LangGraph generic types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LegalDepartmentGraph = CompiledStateGraph<any, any, any>;

/**
 * Create the Legal Department graph
 *
 * M3 Flow:
 * 1. Start → Initialize workflow
 * 2. Echo → Call LLM service with legal metadata context
 * 3. CLO Routing → Determine which specialist to route to
 * 4. Specialist Agent → Analyze document (currently only contract)
 * 5. Complete → Finalize and emit completion event
 * 6. End
 *
 * Future milestones will expand to:
 * - M4-M10: Additional specialist agents (compliance, ip, privacy, etc.)
 * - M11: Multi-agent coordination (invoke multiple specialists)
 * - M12: HITL checkpoints
 * - M13: Report generation
 */
export async function createLegalDepartmentGraph(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  checkpointer: PostgresCheckpointerService,
): Promise<LegalDepartmentGraph> {
  // Create nodes with dependencies
  const echoNode = createEchoNode(llmClient, observability);
  const cloRoutingNode = createCloRoutingNode(observability);

  // M2-M10: All specialist agents
  const contractAgentNode = createContractAgentNode(llmClient, observability);
  const complianceAgentNode = createComplianceAgentNode(
    llmClient,
    observability,
  );
  const ipAgentNode = createIpAgentNode(llmClient, observability);
  const privacyAgentNode = createPrivacyAgentNode(llmClient, observability);
  const employmentAgentNode = createEmploymentAgentNode(
    llmClient,
    observability,
  );
  const corporateAgentNode = createCorporateAgentNode(llmClient, observability);
  const litigationAgentNode = createLitigationAgentNode(
    llmClient,
    observability,
  );
  const realEstateAgentNode = createRealEstateAgentNode(
    llmClient,
    observability,
  );

  // M11: Multi-agent orchestration
  const orchestratorNode = createOrchestratorNode(llmClient, observability);
  const synthesisNode = createSynthesisNode(llmClient, observability);

  // M12: HITL Checkpoint
  const hitlCheckpointNode = createHitlCheckpointNode(observability);

  // M13: Report Generation
  const reportGenerationNode = createReportGenerationNode(
    llmClient,
    observability,
  );

  // Node: Start workflow
  async function startNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    await observability.emitStarted(
      ctx,
      ctx.taskId,
      `Starting Legal Department AI workflow (M0): ${state.userMessage}`,
    );

    return {
      status: 'processing',
      startedAt: Date.now(),
      messages: [new HumanMessage(state.userMessage)],
    };
  }

  // Node: Complete workflow
  async function completeNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    // Only emit completion if we haven't failed
    if (state.status !== 'failed') {
      // Include response, routing decision, specialist outputs, and synthesis in completion
      await observability.emitCompleted(
        ctx,
        ctx.taskId,
        {
          response: state.response,
          routingDecision: state.routingDecision,
          specialistOutputs: state.specialistOutputs,
          synthesis: state.orchestration?.synthesis,
          multiAgent: state.routingDecision?.multiAgent,
        },
        Date.now() - state.startedAt,
      );

      return {
        status: 'completed',
        completedAt: Date.now(),
        messages: [
          ...state.messages,
          new AIMessage(state.response || 'No response generated'),
        ],
      };
    }

    return {
      completedAt: Date.now(),
    };
  }

  // Node: Handle errors
  async function handleErrorNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    await observability.emitFailed(
      ctx,
      ctx.taskId,
      state.error || 'Unknown error',
      Date.now() - state.startedAt,
    );

    return {
      status: 'failed',
      completedAt: Date.now(),
    };
  }

  // Build the graph
  // M2-M13 Complete Flow:
  // - Single agent: start → echo → clo_routing → [specialist] → hitl → report → complete
  // - Multi agent: start → echo → clo_routing → orchestrator → synthesis → hitl → report → complete
  const graph = new StateGraph(LegalDepartmentStateAnnotation)
    .addNode('start', startNode)
    .addNode('echo', echoNode)
    .addNode('clo_routing', cloRoutingNode)
    // M2-M10: All specialist agents
    .addNode('contract_agent', contractAgentNode)
    .addNode('compliance_agent', complianceAgentNode)
    .addNode('ip_agent', ipAgentNode)
    .addNode('privacy_agent', privacyAgentNode)
    .addNode('employment_agent', employmentAgentNode)
    .addNode('corporate_agent', corporateAgentNode)
    .addNode('litigation_agent', litigationAgentNode)
    .addNode('real_estate_agent', realEstateAgentNode)
    // M11: Multi-agent orchestration
    .addNode('orchestrator', orchestratorNode)
    .addNode('synthesis', synthesisNode)
    // M12: HITL Checkpoint
    .addNode('hitl_checkpoint', hitlCheckpointNode)
    // M13: Report Generation
    .addNode('report_generation', reportGenerationNode)
    .addNode('complete', completeNode)
    .addNode('handle_error', handleErrorNode)
    // Edges
    .addEdge('__start__', 'start')
    .addEdge('start', 'echo')
    // After echo, check if we should run CLO routing
    .addConditionalEdges('echo', (state) => {
      if (state.error || state.status === 'failed') {
        return 'handle_error';
      }
      // If we have documents with metadata, run CLO routing
      // Otherwise skip to complete (for simple chat)
      if (
        state.documents &&
        state.documents.length > 0 &&
        state.legalMetadata
      ) {
        return 'clo_routing';
      }
      return 'complete';
    })
    // After CLO routing, check for multi-agent mode or route to specialist
    .addConditionalEdges('clo_routing', (state) => {
      if (state.error || state.status === 'failed') {
        return 'handle_error';
      }

      // M11: Check if multi-agent mode is enabled
      if (state.routingDecision?.multiAgent) {
        return 'orchestrator';
      }

      // M2-M10: Single specialist routing
      const specialist = state.routingDecision?.specialist || 'contract';
      switch (specialist) {
        case 'contract':
          return 'contract_agent';
        case 'compliance':
          return 'compliance_agent';
        case 'ip':
          return 'ip_agent';
        case 'privacy':
          return 'privacy_agent';
        case 'employment':
          return 'employment_agent';
        case 'corporate':
          return 'corporate_agent';
        case 'litigation':
          return 'litigation_agent';
        case 'real_estate':
          return 'real_estate_agent';
        default:
          // Default to contract agent for unrecognized types
          return 'contract_agent';
      }
    })
    // After any specialist agent, go to HITL checkpoint (M12-M13 flow)
    .addConditionalEdges('contract_agent', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'hitl_checkpoint',
    )
    .addConditionalEdges('compliance_agent', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'hitl_checkpoint',
    )
    .addConditionalEdges('ip_agent', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'hitl_checkpoint',
    )
    .addConditionalEdges('privacy_agent', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'hitl_checkpoint',
    )
    .addConditionalEdges('employment_agent', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'hitl_checkpoint',
    )
    .addConditionalEdges('corporate_agent', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'hitl_checkpoint',
    )
    .addConditionalEdges('litigation_agent', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'hitl_checkpoint',
    )
    .addConditionalEdges('real_estate_agent', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'hitl_checkpoint',
    )
    // M11: Multi-agent flow - orchestrator → synthesis → HITL
    .addConditionalEdges('orchestrator', (state) =>
      state.error || state.status === 'failed' ? 'handle_error' : 'synthesis',
    )
    .addConditionalEdges('synthesis', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'hitl_checkpoint',
    )
    // M12-M13: HITL → Report → Complete
    .addConditionalEdges('hitl_checkpoint', (state) =>
      state.error || state.status === 'failed'
        ? 'handle_error'
        : 'report_generation',
    )
    .addConditionalEdges('report_generation', (state) =>
      state.error || state.status === 'failed' ? 'handle_error' : 'complete',
    )
    .addEdge('complete', END)
    .addEdge('handle_error', END);

  // Compile with Postgres checkpointer for state persistence.
  // Cast to LegalDepartmentGraph (CompiledStateGraph<any,any,any>) to avoid TS2589
  // type instantiation depth limit from deeply chained LangGraph builder types.
  const compiled = graph.compile({
    checkpointer: await checkpointer.getSaver(),
  }) as unknown as LegalDepartmentGraph;
  return compiled;
}
