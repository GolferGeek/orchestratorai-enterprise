import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { Command, GraphInterrupt, isInterrupted } from '@langchain/langgraph';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import {
  createLegalDepartmentGraph,
  LegalDepartmentGraph,
} from './legal-department.graph';
import {
  createContractReviewGraph,
  ContractReviewGraph,
} from './workflows/contract-review/contract-review.graph';
import {
  createLegalResearchGraph,
  LegalResearchGraph,
} from './workflows/legal-research/legal-research.graph';
import {
  createAdversarialBriefGraph,
  AdversarialBriefGraph,
} from './workflows/adversarial-brief/adversarial-brief.graph';
import type { AdversarialBriefState } from './workflows/adversarial-brief/adversarial-brief.state';
import {
  createDueDiligenceGraph,
  DueDiligenceGraph,
} from './workflows/due-diligence/due-diligence.graph';
import type { DueDiligenceState } from './workflows/due-diligence/due-diligence.state';
import {
  createComplianceAuditGraph,
  ComplianceAuditGraph,
} from './workflows/compliance-audit/compliance-audit.graph';
import type { ComplianceAuditState } from './workflows/compliance-audit/compliance-audit.state';
import { COMPLIANCE_AUDIT_JOB_TYPE } from './workflows/compliance-audit/compliance-audit.types';
import type { AuditContext } from './workflows/compliance-audit/compliance-audit.types';
import { DD_JOB_TYPE } from './jobs/legal-jobs.types';
import {
  LegalDepartmentInput,
  LegalDepartmentState,
  LegalDepartmentResult,
  LegalDepartmentStatus,
} from './legal-department.state';
import type {
  LegalResearchState,
  ResearchConfig,
} from './workflows/legal-research/legal-research.state';
import type { ReviewDecisionPayload } from './jobs/legal-jobs.types';

/**
 * Input for the legal research workflow.
 */
/**
 * Input for the adversarial brief stress-testing workflow.
 */
export interface AdversarialBriefInput {
  context: import('@orchestrator-ai/transport-types').ExecutionContext;
  userMessage: string;
  documents?: Array<{ name: string; content: string; type?: string }>;
  documentsMetadata?: import('./legal-department.state').LegalDocumentMetadata[];
  maxRounds?: number;
  severityThreshold?: number;
}

export interface LegalResearchInput {
  context: import('@orchestrator-ai/transport-types').ExecutionContext;
  userMessage: string;
  jurisdiction: string;
  practiceArea: string;
  keyFacts: string;
  researchConfig: ResearchConfig;
}

export interface DueDiligenceInput {
  context: import('@orchestrator-ai/transport-types').ExecutionContext;
  documents: Array<{ name: string; content: string; type?: string }>;
  dealContext: Record<string, unknown>;
}

export interface ComplianceAuditInput {
  context: import('@orchestrator-ai/transport-types').ExecutionContext;
  documents: Array<{ name: string; content: string; type?: string }>;
  auditContext: AuditContext;
}
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';
import { WorkflowRagService } from '../shared/services/workflow-rag.service';

/**
 * LegalDepartmentService
 *
 * Manages the Legal Department AI agent lifecycle:
 * - Creates and initializes the graph
 * - Handles legal requests
 * - Provides status checking
 *
 * Phase 3 (M0): Simple echo workflow to prove LLM integration
 * Future phases: Document analysis, metadata extraction, compliance checking
 */
@Injectable()
export class LegalDepartmentService implements OnModuleInit {
  private readonly logger = new Logger(LegalDepartmentService.name);
  private graph!: LegalDepartmentGraph;
  private contractReviewGraph!: ContractReviewGraph;
  private legalResearchGraph!: LegalResearchGraph;
  private adversarialBriefGraph!: AdversarialBriefGraph;
  private dueDiligenceGraph!: DueDiligenceGraph;
  private complianceAuditGraph!: ComplianceAuditGraph;

  constructor(
    private readonly llmClient: LLMHttpClientService,
    private readonly observability: ObservabilityService,
    private readonly checkpointer: PostgresCheckpointerService,
    @Optional()
    private readonly workflowRag?: WorkflowRagService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Legal Department AI graph...');
    this.graph = await createLegalDepartmentGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
      this.workflowRag,
    );
    this.contractReviewGraph = await createContractReviewGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
      this.workflowRag,
    );
    this.legalResearchGraph = await createLegalResearchGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
      this.workflowRag,
    );
    this.adversarialBriefGraph = await createAdversarialBriefGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
      this.workflowRag,
    );
    this.dueDiligenceGraph = await createDueDiligenceGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
      this.workflowRag,
    );
    this.complianceAuditGraph = await createComplianceAuditGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
      this.workflowRag,
    );
    this.logger.log(
      'Legal Department AI graphs initialized (document-onboarding + contract-review + legal-research + adversarial-brief + due-diligence + compliance-audit)',
    );
  }

  /**
   * Process a legal department request
   *
   * @param input - Input containing ExecutionContext and request params
   */
  async process(input: LegalDepartmentInput): Promise<LegalDepartmentResult> {
    const startTime = Date.now();
    const { context } = input;
    const taskId = context.conversationId;

    this.logger.log(
      `Starting legal department workflow: taskId=${taskId}, documents=${input.documents?.length || 0}, documentsMetadata=${input.documentsMetadata?.length || 0}`,
    );

    try {
      // Initial state - pass ExecutionContext directly
      // Include legalMetadata from API document processing for CLO routing
      const initialState: Partial<LegalDepartmentState> = {
        executionContext: context,
        userMessage: input.userMessage,
        documents: input.documents || [],
        documentsMetadata: input.documentsMetadata || [],
        status: 'started',
        startedAt: startTime,
        ...(input.outputMode && { outputMode: input.outputMode }),
        ...(input.clauseMap && { clauseMap: input.clauseMap }),
      };

      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      // Dispatch to the right graph based on outputMode
      const activeGraph =
        input.outputMode === 'contract-review'
          ? this.contractReviewGraph
          : this.graph;

      const finalState = (await activeGraph.invoke(
        initialState,
        config,
      )) as LegalDepartmentState;

      // LangGraph's graph.invoke does NOT throw when an `interrupt()` fires
      // — it returns the current state with an `__interrupt__` key. Surface
      // that to the worker as a GraphInterrupt so the shared catch path
      // flips the job to `awaiting_review`.
      if (isInterrupted(finalState)) {
        this.logger.log(
          `Legal department workflow paused at HITL: taskId=${taskId}`,
        );
        throw new GraphInterrupt(
          (finalState as unknown as { __interrupt__: unknown[] })
            .__interrupt__ as never,
        );
      }

      const duration = Date.now() - startTime;

      this.logger.log(
        `Legal department workflow completed: taskId=${taskId}, status=${finalState.status}, duration=${duration}ms`,
      );

      return {
        taskId,
        status: finalState.status === 'completed' ? 'completed' : 'failed',
        userMessage: input.userMessage,
        response: finalState.response,
        error: finalState.error,
        duration,
        // Include specialist analysis data for frontend consumption
        specialistOutputs: finalState.specialistOutputs,
        documentsMetadata: finalState.documentsMetadata,
        routingDecision: finalState.routingDecision,
        redlineOutput: finalState.redlineOutput,
      };
    } catch (error) {
      // Re-throw GraphInterrupt unchanged so the worker's catch path can
      // transition the job to awaiting_review. Do NOT mark the run as
      // failed — the graph is paused, not broken.
      if (error instanceof GraphInterrupt) throw error;
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Legal department workflow failed: taskId=${taskId}, error=${errorMessage}`,
      );

      // Emit failure event — pass the full ExecutionContext (already in scope)
      await this.observability.emitFailed(
        context,
        taskId, // threadId
        errorMessage,
        duration,
      );

      return {
        taskId,
        status: 'failed',
        userMessage: input.userMessage,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Process a legal research request through the research graph.
   */
  async processResearch(
    input: LegalResearchInput,
  ): Promise<LegalDepartmentResult> {
    const startTime = Date.now();
    const { context } = input;
    const taskId = context.conversationId;

    this.logger.log(
      `Starting legal research workflow: taskId=${taskId}, jurisdiction=${input.jurisdiction}, practiceArea=${input.practiceArea}`,
    );

    try {
      const initialState: Partial<LegalResearchState> = {
        executionContext: context,
        userMessage: input.userMessage,
        jurisdiction: input.jurisdiction,
        practiceArea: input.practiceArea,
        keyFacts: input.keyFacts,
        researchConfig: input.researchConfig,
        status: 'started',
        startedAt: startTime,
      };

      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      const finalState = (await this.legalResearchGraph.invoke(
        initialState,
        config,
      )) as LegalResearchState;

      // Check for HITL interrupt
      if (isInterrupted(finalState)) {
        this.logger.log(
          `Legal research workflow paused at HITL: taskId=${taskId}`,
        );
        throw new GraphInterrupt(
          (finalState as unknown as { __interrupt__: unknown[] })
            .__interrupt__ as never,
        );
      }

      const duration = Date.now() - startTime;

      this.logger.log(
        `Legal research workflow completed: taskId=${taskId}, status=${finalState.status}, duration=${duration}ms`,
      );

      return {
        taskId,
        status: finalState.status === 'completed' ? 'completed' : 'failed',
        userMessage: input.userMessage,
        response: finalState.report || finalState.memo,
        error: finalState.error,
        duration,
        researchTree: finalState.researchTree,
        memo: finalState.memo,
        tokenUsage: finalState.tokenUsage,
      };
    } catch (error) {
      if (error instanceof GraphInterrupt) throw error;
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Legal research workflow failed: taskId=${taskId}, error=${errorMessage}`,
      );

      await this.observability.emitFailed(
        context,
        taskId,
        errorMessage,
        duration,
      );

      return {
        taskId,
        status: 'failed',
        userMessage: input.userMessage,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Process an adversarial brief stress-testing request.
   */
  async processAdversarialBrief(
    input: AdversarialBriefInput,
  ): Promise<LegalDepartmentResult> {
    const startTime = Date.now();
    const { context } = input;
    const taskId = context.conversationId;

    this.logger.log(
      `Starting adversarial brief workflow: taskId=${taskId}, documents=${input.documents?.length || 0}, maxRounds=${input.maxRounds ?? 5}`,
    );

    try {
      const initialState: Partial<AdversarialBriefState> = {
        executionContext: context,
        userMessage: input.userMessage,
        documents: input.documents || [],
        documentsMetadata: input.documentsMetadata || [],
        maxRounds: input.maxRounds ?? 5,
        severityThreshold: input.severityThreshold ?? 7,
        status: 'started',
        startedAt: startTime,
      };

      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      const finalState = (await this.adversarialBriefGraph.invoke(
        initialState,
        config,
      )) as AdversarialBriefState;

      if (isInterrupted(finalState)) {
        this.logger.log(
          `Adversarial brief workflow paused at HITL: taskId=${taskId}`,
        );
        throw new GraphInterrupt(
          (finalState as unknown as { __interrupt__: unknown[] })
            .__interrupt__ as never,
        );
      }

      const duration = Date.now() - startTime;

      this.logger.log(
        `Adversarial brief workflow completed: taskId=${taskId}, status=${finalState.status}, rounds=${finalState.rounds.length}, duration=${duration}ms`,
      );

      return {
        taskId,
        status: finalState.status === 'completed' ? 'completed' : 'failed',
        userMessage: input.userMessage,
        response: finalState.report,
        error: finalState.error,
        duration,
        stressTestReport: finalState.stressTestReport,
        debateTranscript: finalState.rounds,
        fortifiedBrief: finalState.fortifiedBrief,
        tokenUsage: finalState.tokenUsage,
      };
    } catch (error) {
      if (error instanceof GraphInterrupt) throw error;
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Adversarial brief workflow failed: taskId=${taskId}, error=${errorMessage}`,
      );

      await this.observability.emitFailed(
        context,
        taskId,
        errorMessage,
        duration,
      );

      return {
        taskId,
        status: 'failed',
        userMessage: input.userMessage,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Process a due diligence room through the DD graph.
   */
  async processDueDiligence(
    input: DueDiligenceInput,
  ): Promise<LegalDepartmentResult> {
    const startTime = Date.now();
    const { context } = input;
    const taskId = context.conversationId;

    this.logger.log(
      `Starting due diligence workflow: taskId=${taskId}, documents=${input.documents.length}`,
    );

    try {
      // Build DD documents with IDs and size info
      const ddDocuments = input.documents.map((doc, i) => ({
        documentId: `doc-${String(i + 1).padStart(3, '0')}`,
        name: doc.name,
        content: doc.content,
        mimeType: doc.type,
        sizeBytes: new TextEncoder().encode(doc.content).length,
      }));

      const initialState: Partial<DueDiligenceState> = {
        executionContext: context,
        documents: ddDocuments,
        dealContext:
          input.dealContext as unknown as DueDiligenceState['dealContext'],
        status: 'intake',
        startedAt: startTime,
      };

      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      const finalState = (await this.dueDiligenceGraph.invoke(
        initialState,
        config,
      )) as DueDiligenceState;

      if (isInterrupted(finalState)) {
        this.logger.log(
          `Due diligence workflow paused at HITL: taskId=${taskId}`,
        );
        throw new GraphInterrupt(
          (finalState as unknown as { __interrupt__: unknown[] })
            .__interrupt__ as never,
        );
      }

      const duration = Date.now() - startTime;

      this.logger.log(
        `Due diligence workflow completed: taskId=${taskId}, status=${finalState.status}, duration=${duration}ms`,
      );

      return {
        taskId,
        status: finalState.status === 'completed' ? 'completed' : 'failed',
        userMessage: `DD Room: ${input.documents.length} documents`,
        response: finalState.report,
        error: finalState.error,
        duration,
      };
    } catch (error) {
      if (error instanceof GraphInterrupt) throw error;
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Due diligence workflow failed: taskId=${taskId}, error=${errorMessage}`,
      );

      await this.observability.emitFailed(
        context,
        taskId,
        errorMessage,
        duration,
      );

      return {
        taskId,
        status: 'failed',
        userMessage: `DD Room: ${input.documents.length} documents`,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Inject new documents into an existing DD room's LangGraph thread
   * and prepare it for incremental processing. The caller (controller)
   * handles file extraction and storage; this method handles the graph
   * state update.
   */
  async addDocumentsToThread(
    conversationId: string,
    context: ExecutionContext,
    newDocuments: Array<{ name: string; content: string; type?: string }>,
    existingDocumentCount: number,
  ): Promise<{ newDocumentIds: string[] }> {
    const graph = this.dueDiligenceGraph;

    // Read the current thread state to get existing documents
    const snapshot = await graph.getState({
      configurable: { thread_id: conversationId },
    });
    const currentValues = (snapshot?.values ??
      {}) as Partial<DueDiligenceState>;
    const existingDocs = currentValues.documents ?? [];

    // Build new DD document entries with IDs continuing from existing count
    const newDocumentIds: string[] = [];
    const ddNewDocs = newDocuments.map((doc, i) => {
      const docId = `doc-${String(existingDocumentCount + i + 1).padStart(3, '0')}`;
      newDocumentIds.push(docId);
      return {
        documentId: docId,
        name: doc.name,
        content: doc.content,
        mimeType: doc.type,
        sizeBytes: new TextEncoder().encode(doc.content).length,
      };
    });

    // Update the thread state with merged documents and incremental flags
    await graph.updateState(
      { configurable: { thread_id: conversationId } },
      {
        executionContext: context,
        documents: [...existingDocs, ...ddNewDocs],
        incrementalMode: true,
        newDocumentIds,
        status: 'classifying',
        startedAt: Date.now(),
        // Clear prior synthesis/report — they'll be regenerated
        riskMatrix: undefined,
        perCategoryAnalysis: undefined,
        dealBreakerFlags: undefined,
        missingDocuments: undefined,
        crossReferenceMap: undefined,
        report: undefined,
        completedAt: undefined,
        error: undefined,
        hitlGate1Decision: undefined,
        hitlGate2Decision: undefined,
      },
    );

    this.logger.log(
      `Injected ${newDocuments.length} new documents into thread ${conversationId} (total: ${existingDocs.length + ddNewDocs.length})`,
    );

    return { newDocumentIds };
  }

  /**
   * Process an incremental DD update. The thread already has updated state
   * (from addDocumentsToThread), so we just invoke the graph — the
   * conditional start edge routes to incremental_start because
   * incrementalMode === true.
   */
  async processIncrementalDueDiligence(
    context: ExecutionContext,
    totalDocumentCount: number,
  ): Promise<LegalDepartmentResult> {
    const startTime = Date.now();
    const taskId = context.conversationId;

    this.logger.log(`Starting incremental DD update: taskId=${taskId}`);

    try {
      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      // Invoke with null input — the graph reads all state from the
      // checkpointer. The conditional __start__ edge reads incrementalMode
      // from state and routes to incremental_start.
      const finalState = (await this.dueDiligenceGraph.invoke(
        null,
        config,
      )) as DueDiligenceState;

      if (isInterrupted(finalState)) {
        this.logger.log(
          `Incremental DD update paused at HITL: taskId=${taskId}`,
        );
        throw new GraphInterrupt(
          (finalState as unknown as { __interrupt__: unknown[] })
            .__interrupt__ as never,
        );
      }

      const duration = Date.now() - startTime;

      this.logger.log(
        `Incremental DD update completed: taskId=${taskId}, status=${finalState.status}, duration=${duration}ms`,
      );

      return {
        taskId,
        status: finalState.status === 'completed' ? 'completed' : 'failed',
        userMessage: `DD Room incremental update: ${totalDocumentCount} total documents`,
        response: finalState.report,
        error: finalState.error,
        duration,
      };
    } catch (error) {
      if (error instanceof GraphInterrupt) throw error;
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Incremental DD update failed: taskId=${taskId}, error=${errorMessage}`,
      );

      await this.observability.emitFailed(
        context,
        taskId,
        errorMessage,
        duration,
      );

      return {
        taskId,
        status: 'failed',
        userMessage: `DD Room incremental update: ${totalDocumentCount} total documents`,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Process a compliance audit request (Compliance Scan or Full Audit).
   */
  async processComplianceAudit(
    input: ComplianceAuditInput,
  ): Promise<LegalDepartmentResult> {
    const startTime = Date.now();
    const { context } = input;
    const taskId = context.conversationId;

    this.logger.log(
      `Starting compliance audit workflow: taskId=${taskId}, mode=${input.auditContext.mode}, frameworks=[${input.auditContext.frameworkSlugs.join(', ')}], documents=${input.documents.length}`,
    );

    try {
      const caDocuments = input.documents.map((doc, i) => ({
        documentId: `doc-${String(i + 1).padStart(3, '0')}`,
        name: doc.name,
        content: doc.content,
        mimeType: doc.type,
        sizeBytes: new TextEncoder().encode(doc.content).length,
      }));

      const initialState: Partial<ComplianceAuditState> = {
        executionContext: context,
        documents: caDocuments,
        auditContext: input.auditContext,
        status: 'intake',
        startedAt: startTime,
      };

      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      const finalState = (await this.complianceAuditGraph.invoke(
        initialState,
        config,
      )) as ComplianceAuditState;

      if (isInterrupted(finalState)) {
        this.logger.log(
          `Compliance audit workflow paused at HITL: taskId=${taskId}`,
        );
        throw new GraphInterrupt(
          (finalState as unknown as { __interrupt__: unknown[] })
            .__interrupt__ as never,
        );
      }

      const duration = Date.now() - startTime;

      this.logger.log(
        `Compliance audit workflow completed: taskId=${taskId}, status=${finalState.status}, findings=${finalState.findings.length}, duration=${duration}ms`,
      );

      return {
        taskId,
        status: finalState.status === 'completed' ? 'completed' : 'failed',
        userMessage: `Compliance Audit: ${input.auditContext.mode} — ${input.auditContext.frameworkSlugs.join(', ')}`,
        response: finalState.report,
        error: finalState.error,
        duration,
        findings: finalState.findings,
        scorecard: finalState.scorecard,
        remediationPlan: finalState.remediationPlan,
      };
    } catch (error) {
      if (error instanceof GraphInterrupt) throw error;
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Compliance audit workflow failed: taskId=${taskId}, error=${errorMessage}`,
      );

      await this.observability.emitFailed(
        context,
        taskId,
        errorMessage,
        duration,
      );

      return {
        taskId,
        status: 'failed',
        userMessage: `Compliance Audit: ${input.auditContext.mode}`,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Expose the compiled graph for callers that need to stream/invoke it
   * directly (the HITL resume path uses this to call invoke with a
   * `Command({ resume })` without going through process()).
   */
  getGraph(
    capabilitySlug?: string,
  ):
    | LegalDepartmentGraph
    | LegalResearchGraph
    | AdversarialBriefGraph
    | DueDiligenceGraph
    | ComplianceAuditGraph {
    if (capabilitySlug === 'contract-review') return this.contractReviewGraph;
    if (capabilitySlug === 'legal-research') return this.legalResearchGraph;
    if (capabilitySlug === 'adversarial-brief')
      return this.adversarialBriefGraph;
    if (capabilitySlug === DD_JOB_TYPE) return this.dueDiligenceGraph;
    if (capabilitySlug === COMPLIANCE_AUDIT_JOB_TYPE)
      return this.complianceAuditGraph;
    return this.graph;
  }

  /**
   * Resume a paused graph after an attorney review decision.
   *
   * The graph is rehydrated from the Postgres checkpointer keyed on
   * `thread_id === context.conversationId`. Passing a `Command({ resume })`
   * causes `interrupt()` inside hitl-checkpoint.node to return the decision
   * payload; the graph then runs to completion (or the next interrupt).
   *
   * ExecutionContext is passed whole into the config.configurable so
   * downstream nodes that re-read it see the same capsule that was used
   * for the original run.
   */
  async resumeWithDecision(
    context: ExecutionContext,
    threadId: string,
    decision: ReviewDecisionPayload,
    capabilitySlug?: string,
  ): Promise<LegalDepartmentResult> {
    const startTime = Date.now();
    this.logger.log(
      `Resuming legal department workflow: taskId=${threadId}, decision=${decision.decision}, org=${context.orgSlug}, user=${context.userId}`,
    );

    const config = {
      configurable: {
        thread_id: threadId,
      },
    };

    // Command.resume is the LangGraph idiom that feeds a value back into
    // interrupt() on the paused node. The checkpointer rehydrates the rest
    // of the state.
    const activeGraph =
      capabilitySlug === 'contract-review'
        ? this.contractReviewGraph
        : capabilitySlug === 'legal-research'
          ? this.legalResearchGraph
          : capabilitySlug === 'adversarial-brief'
            ? this.adversarialBriefGraph
            : capabilitySlug === DD_JOB_TYPE
              ? this.dueDiligenceGraph
              : capabilitySlug === COMPLIANCE_AUDIT_JOB_TYPE
                ? this.complianceAuditGraph
                : this.graph;
    const finalState = (await activeGraph.invoke(
      new Command({ resume: decision }),
      config,
    )) as LegalDepartmentState;

    // If the resume hits ANOTHER interrupt (e.g. reject path re-ran
    // specialists and paused for re-review), bubble it up so the worker
    // flips the row back to awaiting_review.
    if (isInterrupted(finalState)) {
      this.logger.log(
        `Legal department workflow re-paused at HITL after resume: taskId=${threadId}`,
      );
      throw new GraphInterrupt(
        (finalState as unknown as { __interrupt__: unknown[] })
          .__interrupt__ as never,
      );
    }

    const duration = Date.now() - startTime;

    // For research jobs, the finalState is LegalResearchState (not LegalDepartmentState).
    // Extract research-specific fields when present.
    const researchState = finalState as unknown as Record<string, unknown>;
    return {
      taskId: threadId,
      status: finalState.status === 'completed' ? 'completed' : 'failed',
      userMessage: finalState.userMessage ?? '',
      response:
        finalState.response ??
        (researchState.report as string | undefined) ??
        (researchState.memo as string | undefined),
      error: finalState.error,
      duration,
      specialistOutputs: finalState.specialistOutputs,
      documentsMetadata: finalState.documentsMetadata,
      routingDecision: finalState.routingDecision,
      redlineOutput: finalState.redlineOutput,
      researchTree:
        researchState.researchTree as LegalDepartmentResult['researchTree'],
      memo: researchState.memo as string | undefined,
      tokenUsage:
        researchState.tokenUsage as LegalDepartmentResult['tokenUsage'],
      findings: researchState.findings as LegalDepartmentResult['findings'],
      scorecard: researchState.scorecard as LegalDepartmentResult['scorecard'],
      remediationPlan:
        researchState.remediationPlan as LegalDepartmentResult['remediationPlan'],
    };
    // Intentionally no try/catch: if the resume fails (including a
    // re-interrupt) the worker catches GraphInterrupt and transitions the
    // row to awaiting_review again, and any other error propagates so the
    // worker marks the job as failed with the real error message.
  }

  /**
   * Get status of a workflow by task ID
   */
  async getStatus(taskId: string): Promise<LegalDepartmentStatus | null> {
    try {
      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      const state = await this.graph.getState(config);

      if (!state.values) {
        return null;
      }

      const values = state.values as LegalDepartmentState;

      return {
        taskId,
        status: values.status,
        userMessage: values.userMessage,
        response: values.response,
        error: values.error,
      };
    } catch (error) {
      this.logger.error(`Failed to get status for task ${taskId}:`, error);
      return null;
    }
  }

  /**
   * Get full state history for a task
   */
  async getHistory(taskId: string): Promise<LegalDepartmentState[]> {
    try {
      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      const history: LegalDepartmentState[] = [];
      for await (const state of this.graph.getStateHistory(config)) {
        history.push(state.values as LegalDepartmentState);
      }

      return history;
    } catch (error) {
      this.logger.error(`Failed to get history for task ${taskId}:`, error);
      return [];
    }
  }
}
