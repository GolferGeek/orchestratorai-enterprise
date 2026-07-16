import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
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
import type {
  RiskCategory,
  Severity,
  RiskMatrixCell,
  RunningFindingsSummary,
  PerDocumentOutput,
} from './workflows/due-diligence/due-diligence.types';
import {
  createComplianceAuditGraph,
  ComplianceAuditGraph,
} from './workflows/compliance-audit/compliance-audit.graph';
import type { ComplianceAuditState } from './workflows/compliance-audit/compliance-audit.state';
import { COMPLIANCE_AUDIT_JOB_TYPE } from './workflows/compliance-audit/compliance-audit.types';
import type { AuditContext } from './workflows/compliance-audit/compliance-audit.types';
import {
  createSentinelIngestGraph,
  SentinelIngestGraph,
} from './workflows/sentinel/sentinel-ingest.graph';
import type { SentinelIngestState } from './workflows/sentinel/sentinel-ingest.state';
import {
  createSentinelEvaluateGraph,
  SentinelEvaluateGraph,
} from './workflows/sentinel/sentinel-evaluate.graph';
import type { SentinelEvaluateState } from './workflows/sentinel/sentinel-evaluate.state';
import {
  SENTINEL_INGEST_JOB_TYPE,
  SENTINEL_EVALUATE_JOB_TYPE,
} from './sentinel/sentinel.types';
import { SentinelRepository } from './sentinel/sentinel.repository';
import {
  createDealMemoGraph,
  DealMemoGraph,
} from './workflows/deal-memo/deal-memo.graph';
import {
  createDiscoveryReviewGraph,
  DiscoveryReviewGraph,
} from './workflows/discovery-review/discovery-review.graph';
import type { DiscoveryReviewState } from './workflows/discovery-review/discovery-review.state';
import { DISCOVERY_REVIEW_JOB_TYPE } from './workflows/discovery-review/discovery-review.types';
import type { DealMemoState } from './workflows/deal-memo/deal-memo.state';
import type {
  DealStructure,
  DealMemoJobResult,
} from './workflows/deal-memo/deal-memo.types';
import type { ParentDDSnapshot } from './workflows/deal-memo/nodes/memo-intake.node';
import { DealMemoArtifactService } from './workflows/deal-memo/artifacts/deal-memo-artifact.service';
import {
  DD_JOB_TYPE,
  DEAL_MEMO_JOB_TYPE,
  type AgentJobRow,
  type ComparisonResult,
  type ComparisonRoomSummary,
  type ComparisonDealBreaker,
  type ComparisonMissingDocument,
  type SeverityCounts,
} from './jobs/legal-jobs.types';
import { LegalJobsRepository } from './jobs/legal-jobs.repository';
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

export interface DealMemoInput {
  context: import('@orchestrator-ai/transport-types').ExecutionContext;
  parentJobId: string;
  parentConversationId: string;
  dealStructure: DealStructure;
  reviewerNotes?: string;
}

export interface SentinelIngestInput {
  context: import('@orchestrator-ai/transport-types').ExecutionContext;
  sourceId: string;
}

export interface SentinelEvaluateInput {
  context: import('@orchestrator-ai/transport-types').ExecutionContext;
  orgSlug: string;
}

export interface DiscoveryReviewInput {
  context: import('@orchestrator-ai/transport-types').ExecutionContext;
  documents: Array<{
    documentId: string;
    name: string;
    content: string;
    mimeType?: string;
    sizeBytes: number;
  }>;
  reviewProtocol: import('./workflows/discovery-review/discovery-review.types').ReviewProtocol;
}

export interface DepositionPrepServiceInput {
  context: import('@orchestrator-ai/transport-types').ExecutionContext;
  input: DepositionPrepInput;
}
import { LLMHttpClientService } from '../shared/services/llm-http-client.service';
import { ObservabilityService } from '../shared/services/observability.service';
import { PostgresCheckpointerService } from '../shared/persistence/postgres-checkpointer.service';
import { WorkflowRagService } from '../shared/services/workflow-rag.service';
import { LegalDocumentsStorageService } from './jobs/legal-documents-storage.service';
import { DepositionPrepService } from './workflows/deposition-prep/deposition-prep.service';
import type { DepositionPrepInput } from './workflows/deposition-prep/deposition-prep.types';
import { CrossExamSimulationService } from './workflows/cross-exam-simulation/cross-exam-simulation.service';
import type { CrossExamSimulationInput } from './workflows/cross-exam-simulation/cross-exam-simulation.types';
import { MonteCarloTrialSimulatorService } from './workflows/monte-carlo-trial-simulator/monte-carlo-trial-simulator.service';
import type { CaseRecord } from './workflows/monte-carlo-trial-simulator/monte-carlo-trial-simulator.types';

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
  private dealMemoGraph!: DealMemoGraph;
  private sentinelIngestGraph!: SentinelIngestGraph;
  private sentinelEvaluateGraph!: SentinelEvaluateGraph;
  private discoveryReviewGraph!: DiscoveryReviewGraph;

  constructor(
    private readonly llmClient: LLMHttpClientService,
    private readonly observability: ObservabilityService,
    private readonly checkpointer: PostgresCheckpointerService,
    private readonly jobsRepository: LegalJobsRepository,
    private readonly dealMemoArtifactService: DealMemoArtifactService,
    private readonly sentinelRepository: SentinelRepository,
    private readonly documentsStorage: LegalDocumentsStorageService,
    private readonly depositionPrepService: DepositionPrepService,
    private readonly crossExamSimulationService: CrossExamSimulationService,
    private readonly monteCarloTrialSimulatorService: MonteCarloTrialSimulatorService,
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
    // Deal-memo reads a parent DD room's checkpoint snapshot. We capture
    // this.dueDiligenceGraph in a closure (getState()) so the memo_intake
    // node can read parent state without importing another graph directly.
    this.dealMemoGraph = await createDealMemoGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
      this.jobsRepository,
      async (threadId: string): Promise<ParentDDSnapshot | null> => {
        const snapshot = await this.dueDiligenceGraph.getState({
          configurable: { thread_id: threadId },
        });
        const values = snapshot?.values as Record<string, unknown> | undefined;
        if (!values) return null;
        return {
          dealContext: values.dealContext as ParentDDSnapshot['dealContext'],
          documentIndex:
            values.documentIndex as ParentDDSnapshot['documentIndex'],
          perDocumentOutputs:
            values.perDocumentOutputs as ParentDDSnapshot['perDocumentOutputs'],
          runningFindings:
            values.runningFindings as ParentDDSnapshot['runningFindings'],
          riskMatrix: values.riskMatrix as ParentDDSnapshot['riskMatrix'],
          dealBreakerFlags:
            values.dealBreakerFlags as ParentDDSnapshot['dealBreakerFlags'],
          missingDocuments:
            values.missingDocuments as ParentDDSnapshot['missingDocuments'],
        };
      },
      this.dealMemoArtifactService,
    );
    this.sentinelIngestGraph = await createSentinelIngestGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
      this.sentinelRepository,
      this.workflowRag,
    );
    this.sentinelEvaluateGraph = await createSentinelEvaluateGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
      this.sentinelRepository,
      this.workflowRag,
    );
    this.discoveryReviewGraph = await createDiscoveryReviewGraph(
      this.llmClient,
      this.observability,
      this.checkpointer,
      this.documentsStorage,
    );
    this.logger.log(
      'Legal Department AI graphs initialized (document-onboarding + contract-review + legal-research + adversarial-brief + due-diligence + compliance-audit + deal-memo + sentinel-ingest + sentinel-evaluate + discovery-review)',
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

    // Update the thread state with merged documents and incremental flags.
    // Do NOT clear riskMatrix/report/dealBreakerFlags etc — they remain
    // readable via REST endpoints during incremental processing (PRD G5).
    // The synthesis and report nodes will overwrite them when they run.
    await graph.updateState(
      { configurable: { thread_id: conversationId } },
      {
        executionContext: context,
        documents: [...existingDocs, ...ddNewDocs],
        incrementalMode: true,
        newDocumentIds,
        status: 'classifying',
        startedAt: Date.now(),
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

      // Pass incrementalMode in the input so the conditional __start__
      // edge can route to incremental_start. The checkpointer merges this
      // with existing state via the replace reducer.
      const finalState = (await this.dueDiligenceGraph.invoke(
        { incrementalMode: true } as Partial<DueDiligenceState>,
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
   * Process a deal memo generation job. Reads a completed parent DD Room's
   * checkpoint snapshot and drafts an acquisition-agreement memo.
   *
   * See: docs/efforts/current/dd-deal-memo-generation/prd.md
   */
  async processDealMemo(input: DealMemoInput): Promise<LegalDepartmentResult> {
    const startTime = Date.now();
    const { context } = input;
    const taskId = context.conversationId;

    this.logger.log(
      `Starting deal-memo workflow: taskId=${taskId}, parent=${input.parentJobId}, structure=${input.dealStructure}`,
    );

    try {
      const initialState: Partial<DealMemoState> = {
        executionContext: context,
        parentJobId: input.parentJobId,
        parentConversationId: input.parentConversationId,
        dealStructure: input.dealStructure,
        reviewerNotes: input.reviewerNotes,
        status: 'intake',
        startedAt: startTime,
      };

      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      const finalState = (await this.dealMemoGraph.invoke(
        initialState,
        config,
      )) as DealMemoState;

      if (isInterrupted(finalState)) {
        this.logger.log(`Deal-memo workflow paused at HITL: taskId=${taskId}`);
        throw new GraphInterrupt(
          (finalState as unknown as { __interrupt__: unknown[] })
            .__interrupt__ as never,
        );
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Deal-memo workflow completed: taskId=${taskId}, status=${finalState.status}, duration=${duration}ms`,
      );

      return {
        taskId,
        status: finalState.status === 'completed' ? 'completed' : 'failed',
        userMessage: `Deal Memo: ${input.dealStructure} (parent=${input.parentJobId})`,
        response: finalState.memoMarkdown,
        error: finalState.error,
        duration,
        // Memo-specific fields surfaced via the generic result shape so the
        // worker's markCompleted call persists them on the job row.
        memoMarkdown: finalState.memoMarkdown,
        sectionCitations: Object.fromEntries(
          Object.entries(finalState.sectionDrafts ?? {}).map(
            ([sectionId, draft]) => [sectionId, draft.citations],
          ),
        ) as DealMemoJobResult['sectionCitations'],
        artifactPath: finalState.artifactPath,
        docxArtifactPath: finalState.docxArtifactPath,
      } as LegalDepartmentResult;
    } catch (error) {
      if (error instanceof GraphInterrupt) throw error;
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Deal-memo workflow failed: taskId=${taskId}, error=${errorMessage}`,
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
        userMessage: `Deal Memo: ${input.dealStructure}`,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Process a sentinel signal ingestion job. Fetches signals from the
   * specified source, deduplicates, classifies via LLM, and stores results.
   */
  async processSentinelIngest(
    input: SentinelIngestInput,
  ): Promise<LegalDepartmentResult> {
    const startTime = Date.now();
    const { context } = input;
    const taskId = context.conversationId;

    this.logger.log(
      `Starting sentinel-ingest workflow: taskId=${taskId}, sourceId=${input.sourceId}`,
    );

    try {
      // Load the source configuration
      const source = await this.sentinelRepository.getSource(
        input.sourceId,
        context.orgSlug,
      );
      if (!source) {
        throw new Error(
          `Source ${input.sourceId} not found in org ${context.orgSlug}`,
        );
      }

      const initialState: Partial<SentinelIngestState> = {
        executionContext: context,
        sourceConfig: source,
        status: 'fetching',
        startedAt: startTime,
      };

      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      const finalState = (await this.sentinelIngestGraph.invoke(
        initialState,
        config,
      )) as SentinelIngestState;

      const duration = Date.now() - startTime;

      this.logger.log(
        `Sentinel-ingest workflow completed: taskId=${taskId}, status=${finalState.status}, classified=${finalState.classifiedSignals.length}, duration=${duration}ms`,
      );

      return {
        taskId,
        status: finalState.status === 'completed' ? 'completed' : 'failed',
        userMessage: `Sentinel Ingest: ${source.name}`,
        response: `Ingested ${finalState.classifiedSignals.length} new signals from ${source.name}`,
        error: finalState.error,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Sentinel-ingest workflow failed: taskId=${taskId}, error=${errorMessage}`,
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
        userMessage: `Sentinel Ingest: sourceId=${input.sourceId}`,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Process a sentinel evaluate job. Cross-references unprocessed signals
   * against the org's portfolio holdings and generates alerts.
   */
  async processSentinelEvaluate(
    input: SentinelEvaluateInput,
  ): Promise<LegalDepartmentResult> {
    const startTime = Date.now();
    const { context } = input;
    const taskId = context.conversationId;

    this.logger.log(
      `Starting sentinel-evaluate workflow: taskId=${taskId}, orgSlug=${input.orgSlug}`,
    );

    try {
      const initialState: Partial<SentinelEvaluateState> = {
        executionContext: context,
        status: 'loading',
        startedAt: startTime,
      };

      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      const finalState = (await this.sentinelEvaluateGraph.invoke(
        initialState,
        config,
      )) as SentinelEvaluateState;

      const duration = Date.now() - startTime;

      this.logger.log(
        `Sentinel-evaluate workflow completed: taskId=${taskId}, status=${finalState.status}, alerts=${finalState.alerts.length}, duration=${duration}ms`,
      );

      return {
        taskId,
        status: finalState.status === 'completed' ? 'completed' : 'failed',
        userMessage: `Sentinel Evaluate: ${input.orgSlug}`,
        response: `Evaluated signals: ${finalState.alerts.length} alerts generated`,
        error: finalState.error,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Sentinel-evaluate workflow failed: taskId=${taskId}, error=${errorMessage}`,
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
        userMessage: `Sentinel Evaluate: orgSlug=${input.orgSlug}`,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Process a deposition preparation job through the deposition-prep graph.
   */
  async processDepositionPrep(
    params: DepositionPrepServiceInput,
  ): Promise<LegalDepartmentResult> {
    const result = await this.depositionPrepService.process(params);
    return {
      taskId: result.taskId,
      status: result.status,
      userMessage: `Deposition Prep: ${params.input.witnessType} — ${params.input.mode}`,
      error: result.error,
      duration: result.duration,
      specialistOutputs: undefined,
      preparationOutline: result.preparationOutline,
      predictedQuestions: result.predictedQuestions,
      answerCoaching: result.answerCoaching,
    };
  }

  /**
   * Start a new cross-examination simulation session. Returns `awaiting_answer`
   * when the graph pauses at the first question interrupt, or `completed` /
   * `failed` if the session ends immediately (should not happen in normal flow).
   */
  async processSimulation(
    context: import('@orchestrator-ai/transport-types').ExecutionContext,
    input: CrossExamSimulationInput,
  ): Promise<
    import('./workflows/cross-exam-simulation/cross-exam-simulation.service').CrossExamSimulationResult
  > {
    return this.crossExamSimulationService.processSimulation({
      context,
      input,
    });
  }

  /**
   * Resume a paused simulation with a submitted answer. Returns `awaiting_answer`
   * if the graph pauses at the next question, or `completed` after the final answer.
   */
  async resumeWithSimulationAnswer(
    context: import('@orchestrator-ai/transport-types').ExecutionContext,
    threadId: string,
    answer: string,
    turn: number,
  ): Promise<
    import('./workflows/cross-exam-simulation/cross-exam-simulation.service').CrossExamSimulationResult
  > {
    return this.crossExamSimulationService.resumeWithSimulationAnswer(
      context,
      threadId,
      answer,
      turn,
    );
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
    | ComplianceAuditGraph
    | DealMemoGraph
    | SentinelIngestGraph
    | SentinelEvaluateGraph
    | DiscoveryReviewGraph {
    if (capabilitySlug === 'contract-review') return this.contractReviewGraph;
    if (capabilitySlug === 'legal-research') return this.legalResearchGraph;
    if (capabilitySlug === 'adversarial-brief')
      return this.adversarialBriefGraph;
    if (capabilitySlug === DD_JOB_TYPE) return this.dueDiligenceGraph;
    if (capabilitySlug === COMPLIANCE_AUDIT_JOB_TYPE)
      return this.complianceAuditGraph;
    if (capabilitySlug === DEAL_MEMO_JOB_TYPE) return this.dealMemoGraph;
    if (capabilitySlug === SENTINEL_INGEST_JOB_TYPE)
      return this.sentinelIngestGraph;
    if (capabilitySlug === SENTINEL_EVALUATE_JOB_TYPE)
      return this.sentinelEvaluateGraph;
    if (capabilitySlug === DISCOVERY_REVIEW_JOB_TYPE)
      return this.discoveryReviewGraph;
    return this.graph;
  }

  /**
   * Process a discovery document review job.
   *
   * The documents array is pre-populated by the worker from the uploaded
   * files. The reviewProtocol is extracted from the job's input.data.
   */
  async processDiscoveryReview(
    input: DiscoveryReviewInput,
  ): Promise<LegalDepartmentResult> {
    const startTime = Date.now();
    const { context } = input;
    const taskId = context.conversationId;

    this.logger.log(
      `Starting discovery-review workflow: taskId=${taskId}, documents=${input.documents.length}, matter=${input.reviewProtocol.matterName}`,
    );

    try {
      const initialState: Partial<DiscoveryReviewState> = {
        executionContext: context,
        documents: input.documents,
        reviewProtocol: input.reviewProtocol,
        status: 'protocol_setup',
        startedAt: startTime,
      };

      const config = {
        configurable: {
          thread_id: taskId,
        },
      };

      const finalState = (await this.discoveryReviewGraph.invoke(
        initialState,
        config,
      )) as DiscoveryReviewState;

      if (isInterrupted(finalState)) {
        this.logger.log(
          `Discovery review workflow paused at HITL: taskId=${taskId}`,
        );
        throw new GraphInterrupt(
          (finalState as unknown as { __interrupt__: unknown[] })
            .__interrupt__ as never,
        );
      }

      const duration = Date.now() - startTime;

      this.logger.log(
        `Discovery review workflow completed: taskId=${taskId}, status=${finalState.status}, documents=${finalState.documents.length}, duration=${duration}ms`,
      );

      return {
        taskId,
        status: finalState.status === 'completed' ? 'completed' : 'failed',
        userMessage: `Discovery Review: "${input.reviewProtocol.matterName}" — ${input.documents.length} documents`,
        response: undefined,
        error: finalState.error,
        duration,
      };
    } catch (error) {
      if (error instanceof GraphInterrupt) throw error;
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Discovery review workflow failed: taskId=${taskId}, error=${errorMessage}`,
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
        userMessage: `Discovery Review: "${input.reviewProtocol.matterName}"`,
        error: errorMessage,
        duration,
      };
    }
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
    const activeGraph = this.getGraph(capabilitySlug);
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

    // For research / deal-memo jobs, the finalState is not a
    // LegalDepartmentState. Extract workflow-specific fields when present.
    const wideState = finalState as unknown as Record<string, unknown>;

    // Deal-memo resume: derive sectionCitations from sectionDrafts keyed
    // by SectionId. Matches processDealMemo()'s mapping so the worker's
    // markCompleted spread persists both fields onto the memo job row.
    let memoMarkdown: string | undefined;
    let sectionCitations: LegalDepartmentResult['sectionCitations'];
    let artifactPath: string | undefined;
    let docxArtifactPath: string | undefined;
    if (capabilitySlug === DEAL_MEMO_JOB_TYPE) {
      memoMarkdown = wideState.memoMarkdown as string | undefined;
      const sectionDrafts = (wideState.sectionDrafts ?? {}) as Record<
        string,
        { citations: unknown[] }
      >;
      sectionCitations = Object.fromEntries(
        Object.entries(sectionDrafts).map(([sectionId, draft]) => [
          sectionId,
          draft.citations,
        ]),
      ) as LegalDepartmentResult['sectionCitations'];
      artifactPath = wideState.artifactPath as string | undefined;
      docxArtifactPath = wideState.docxArtifactPath as string | undefined;
    }

    return {
      taskId: threadId,
      status: finalState.status === 'completed' ? 'completed' : 'failed',
      userMessage: finalState.userMessage ?? '',
      response:
        finalState.response ??
        (wideState.report as string | undefined) ??
        (wideState.memo as string | undefined) ??
        memoMarkdown,
      error: finalState.error,
      duration,
      specialistOutputs: finalState.specialistOutputs,
      documentsMetadata: finalState.documentsMetadata,
      routingDecision: finalState.routingDecision,
      redlineOutput: finalState.redlineOutput,
      researchTree:
        wideState.researchTree as LegalDepartmentResult['researchTree'],
      memo: wideState.memo as string | undefined,
      tokenUsage: wideState.tokenUsage as LegalDepartmentResult['tokenUsage'],
      findings: wideState.findings as LegalDepartmentResult['findings'],
      scorecard: wideState.scorecard as LegalDepartmentResult['scorecard'],
      remediationPlan:
        wideState.remediationPlan as LegalDepartmentResult['remediationPlan'],
      memoMarkdown,
      sectionCitations,
      artifactPath,
      docxArtifactPath,
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

  // ── Cross-Room Comparison ────────────────────────────────────────────

  /**
   * Compare multiple DD rooms by loading each room's graph state checkpoint
   * in parallel and extracting/normalizing risk, financial, and coverage data.
   *
   * Throws NotFoundException if any job is missing, not a DD room, or
   * inaccessible (fail-closed, no partial comparison).
   */
  async compareRooms(
    jobIds: string[],
    access: { allowedForUserId: string; isAdmin: boolean },
    orgSlug: string,
  ): Promise<ComparisonResult> {
    // 1. Load all job rows in parallel and validate access
    const rowResults = await Promise.all(
      jobIds.map((id) =>
        this.jobsRepository.findByIdForOrg(id, orgSlug, access),
      ),
    );
    const rows: AgentJobRow[] = [];
    for (let i = 0; i < jobIds.length; i++) {
      const row = rowResults[i];
      if (!row) {
        throw new NotFoundException(`Job ${jobIds[i]} not found`);
      }
      const inputMetadata = (row.input?.metadata ?? {}) as Record<
        string,
        unknown
      >;
      if (inputMetadata.jobType !== DD_JOB_TYPE) {
        throw new NotFoundException(`Job ${jobIds[i]} not found`);
      }
      rows.push(row);
    }

    // 2. Load graph state checkpoints in parallel
    const graph = this.getGraph(DD_JOB_TYPE) as DueDiligenceGraph;
    const snapshots = await Promise.all(
      rows.map((row) =>
        graph.getState({
          configurable: { thread_id: row.conversation_id },
        }),
      ),
    );

    // 3. Extract and normalize comparison data
    const roomSummaries: ComparisonRoomSummary[] = [];
    const allDealBreakers: ComparisonDealBreaker[] = [];
    const allMissingDocs: ComparisonMissingDocument[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const values = (snapshots[i]?.values ?? {}) as Record<string, unknown>;
      const inputData = (row.input?.data ?? {}) as Record<string, unknown>;
      const dealContext = (inputData.dealContext ?? {}) as Record<
        string,
        unknown
      >;

      const targetCompany = (dealContext.targetCompany as string) ?? 'Unknown';

      // Risk summary
      const riskMatrix = values.riskMatrix as
        | { cells: RiskMatrixCell[] }
        | undefined;
      const riskSummary = this.extractRiskSummary(riskMatrix);

      // Deal-breaker flags
      const dealBreakerFlags = (values.dealBreakerFlags ?? []) as Array<{
        finding: string;
        category: string;
        reasoning: string;
        recommendation: string;
      }>;
      for (const flag of dealBreakerFlags) {
        allDealBreakers.push({
          jobId: row.id,
          targetCompany,
          finding: flag.finding,
          category: flag.category,
          reasoning: flag.reasoning,
          recommendation: flag.recommendation,
        });
      }

      // Financial summary
      const runningFindings = (values.runningFindings ?? {}) as Record<
        string,
        RunningFindingsSummary
      >;
      const perDocumentOutputs = (values.perDocumentOutputs ?? {}) as Record<
        string,
        PerDocumentOutput
      >;
      const financialSummary = this.extractFinancialSummary(
        runningFindings,
        perDocumentOutputs,
      );

      // Coverage
      const documentIndex = (values.documentIndex ?? []) as unknown[];
      const documentsAnalyzed = (values.documentsAnalyzed ?? []) as string[];
      const missingDocuments = (values.missingDocuments ?? []) as Array<{
        description: string;
        importance: Severity;
      }>;

      for (const missing of missingDocuments) {
        allMissingDocs.push({
          jobId: row.id,
          targetCompany,
          description: missing.description,
          importance: missing.importance,
        });
      }

      roomSummaries.push({
        jobId: row.id,
        targetCompany,
        transactionType: (dealContext.transactionType as string) ?? 'unknown',
        dealValueRange: dealContext.dealValueRange as string | undefined,
        jurisdictions: (dealContext.jurisdictions as string[]) ?? [],
        status: row.status,
        progress: row.progress,
        documentCount: documentIndex.length,
        analyzedCount: documentsAnalyzed.length,
        missingDocumentCount: missingDocuments.length,
        dealBreakerCount: dealBreakerFlags.length,
        riskSummary,
        financialSummary,
        completedAt: row.completed_at,
      });
    }

    return {
      rooms: roomSummaries,
      dealBreakers: allDealBreakers,
      missingDocuments: allMissingDocs,
    };
  }

  /**
   * Aggregate risk matrix cells into per-category severity counts.
   */
  private extractRiskSummary(
    riskMatrix: { cells: RiskMatrixCell[] } | undefined,
  ): ComparisonRoomSummary['riskSummary'] {
    const categories: RiskCategory[] = [
      'contractual',
      'ip',
      'employment',
      'regulatory',
      'financial',
      'corporate',
      'environmental',
    ];
    const zeroCounts = (): SeverityCounts => ({
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    });

    const byCategory = {} as Record<RiskCategory, SeverityCounts>;
    for (const cat of categories) {
      byCategory[cat] = zeroCounts();
    }
    const totalBySeverity = zeroCounts();

    if (riskMatrix?.cells) {
      for (const cell of riskMatrix.cells) {
        if (byCategory[cell.category]) {
          byCategory[cell.category][cell.severity] += cell.count;
          totalBySeverity[cell.severity] += cell.count;
        }
      }
    }

    return { byCategory, totalBySeverity };
  }

  /**
   * Extract financial specialist summaries from running findings and
   * per-document specialist outputs (tabular data).
   */
  private extractFinancialSummary(
    runningFindings: Record<string, RunningFindingsSummary>,
    perDocumentOutputs: Record<string, PerDocumentOutput>,
  ): ComparisonRoomSummary['financialSummary'] {
    const financialSpecialists = [
      'financial-statements',
      'revenue-concentration',
      'working-capital',
      'cap-table',
      'debt-schedule',
    ];

    const summary: ComparisonRoomSummary['financialSummary'] = {};

    for (const specialistKey of financialSpecialists) {
      const findings = runningFindings[specialistKey];
      if (!findings) continue;

      // Extract key metrics from tabular data in per-document outputs.
      // Aggregate across all documents: collect all unique metric labels,
      // using the latest value seen for each label. This ensures multi-doc
      // rooms don't silently discard data from later documents.
      const metricsByLabel = new Map<string, string | number>();
      let overallRisk: Severity = 'low';

      // Scan per-document outputs for this specialist's tabular data
      for (const docOutput of Object.values(perDocumentOutputs)) {
        const specialistOutput = docOutput.specialistOutputs?.[
          specialistKey
        ] as
          | {
              tabular?: {
                columns: string[];
                rows: Array<Array<string | number>>;
              };
              overallRisk?: Severity;
              keyFindings?: Array<{ finding?: string; severity?: string }>;
            }
          | undefined;

        if (!specialistOutput) continue;

        // Use the highest risk level found
        if (specialistOutput.overallRisk) {
          overallRisk = this.higherSeverity(
            overallRisk,
            specialistOutput.overallRisk,
          );
        }

        // Merge tabular metrics — later documents update existing labels
        if (specialistOutput.tabular?.rows?.length) {
          const { rows: tabRows } = specialistOutput.tabular;
          for (const tabRow of tabRows) {
            if (tabRow.length >= 2) {
              metricsByLabel.set(
                String(tabRow[0]),
                tabRow[1] != null ? tabRow[1] : 'N/A',
              );
            }
          }
        }
      }

      // Convert aggregated metrics map to array (cap at 10 to avoid huge payloads)
      const keyMetrics: Array<{ label: string; value: string | number }> = [];
      for (const [label, value] of metricsByLabel) {
        if (keyMetrics.length >= 10) break;
        keyMetrics.push({ label, value });
      }

      summary[specialistKey] = {
        specialistKey,
        overallRisk,
        keyMetrics,
        findingCount: findings.keyFindings?.length ?? 0,
      };
    }

    return summary;
  }

  private higherSeverity(a: Severity, b: Severity): Severity {
    const rank: Record<Severity, number> = {
      critical: 3,
      high: 2,
      medium: 1,
      low: 0,
    };
    return rank[a] >= rank[b] ? a : b;
  }

  /**
   * Process a Monte Carlo trial simulation job through the trial-simulator graph.
   */
  async processMonteCarloTrialSimulator(params: {
    context: ExecutionContext;
    input: CaseRecord;
  }): Promise<LegalDepartmentResult> {
    const startTime = Date.now();
    try {
      const result = await this.monteCarloTrialSimulatorService.process(params);
      return {
        taskId: params.context.conversationId,
        status: 'completed',
        userMessage: `Monte Carlo Trial Simulator: ${params.input.matterId} — ${result.simulationsCompleted}/${result.simulationsRequested} simulations`,
        duration: Date.now() - startTime,
        monteCarloResult: result,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        taskId: params.context.conversationId,
        status: 'failed',
        userMessage: `Monte Carlo Trial Simulator: ${params.input.matterId}`,
        error: errorMessage,
        duration: Date.now() - startTime,
      };
    }
  }
}
