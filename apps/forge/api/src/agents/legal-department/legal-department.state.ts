import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { ContractAnalysisOutput } from './nodes/contract-agent.node';
import { ComplianceAnalysisOutput } from './nodes/compliance-agent.node';
import { IpAnalysisOutput } from './nodes/ip-agent.node';
import { PrivacyAnalysisOutput } from './nodes/privacy-agent.node';
import { EmploymentAnalysisOutput } from './nodes/employment-agent.node';
import { CorporateAnalysisOutput } from './nodes/corporate-agent.node';
import { LitigationAnalysisOutput } from './nodes/litigation-agent.node';
import { RealEstateAnalysisOutput } from './nodes/real-estate-agent.node';
import { RoutingDecision } from './nodes/clo-routing.node';
import { SynthesisOutput } from './nodes/synthesis.node';
import type { ReviewDecisionPayload } from './jobs/legal-jobs.types';
import type { ClauseMap, RedlineOutput } from './legal-department.types';

/**
 * Legal document metadata from API's document processing
 * Matches the structure from DocumentProcessingService
 */
export interface LegalDocumentMetadata {
  /** Document classification */
  documentType: {
    type: string;
    confidence: number;
    alternatives?: Array<{
      type: string;
      confidence: number;
    }>;
    reasoning?: string;
  };
  /** Detected sections and clauses */
  sections: {
    sections: Array<{
      title: string;
      type: string;
      startIndex: number;
      endIndex: number;
      content: string;
      confidence: number;
      clauses?: Array<{
        identifier?: string;
        title?: string;
        startIndex: number;
        endIndex: number;
        content: string;
        confidence: number;
      }>;
    }>;
    confidence: number;
    structureType: 'formal' | 'informal' | 'mixed' | 'unstructured';
  };
  /** Signature blocks and signatories */
  signatures: {
    signatures: Array<{
      partyName?: string;
      signerName?: string;
      signerTitle?: string;
      signatureDate?: string;
      startIndex: number;
      endIndex: number;
      content: string;
      confidence: number;
      detectionMethod: 'keyword' | 'pattern' | 'position';
    }>;
    confidence: number;
    partyCount: number;
  };
  /** Extracted dates */
  dates: {
    dates: Array<{
      originalText: string;
      normalizedDate: string;
      dateType: string;
      confidence: number;
      position: number;
      context?: string;
    }>;
    primaryDate?: {
      originalText: string;
      normalizedDate: string;
      dateType: string;
      confidence: number;
      position: number;
      context?: string;
    };
    confidence: number;
  };
  /** Extracted parties */
  parties: {
    parties: Array<{
      name: string;
      type: string;
      role?: string;
      position: number;
      context?: string;
      confidence: number;
      identifiers?: {
        address?: string;
        registrationNumber?: string;
        jurisdiction?: string;
      };
    }>;
    contractingParties?: [
      {
        name: string;
        type: string;
        role?: string;
        position: number;
        context?: string;
        confidence: number;
      },
      {
        name: string;
        type: string;
        role?: string;
        position: number;
        context?: string;
        confidence: number;
      },
    ];
    confidence: number;
  };
  /** Overall confidence scoring */
  confidence: {
    overall: number;
    breakdown: {
      documentType?: number;
      sections?: number;
      signatures?: number;
      dates?: number;
      parties?: number;
    };
    factors: {
      textQuality: number;
      extractionMethod: 'vision' | 'ocr' | 'native' | 'none';
      completeness: number;
      patternMatchCount: number;
    };
  };
  /** Metadata extraction timestamp */
  extractedAt: string;
}

/**
 * Legal Department input interface
 * Validation is handled by NestJS DTOs at the controller level
 *
 * Context flows through via ExecutionContext parameter.
 * Provider/model come from context.provider and context.model.
 */
export interface LegalDepartmentInput {
  /** Execution context - contains orgSlug, userId, conversationId, taskId, provider, model, etc. */
  context: ExecutionContext;
  userMessage: string;
  /** Optional: Multiple documents for legal review/analysis */
  documents?: Array<{
    name: string;
    content: string;
    type?: string;
  }>;
  /** Optional: Legal metadata extracted for each document. Parallel to documents[]. */
  documentsMetadata?: LegalDocumentMetadata[];
  /** Output mode: 'analysis' (default) or 'contract-review' for clause-level redlining */
  outputMode?: 'analysis' | 'contract-review';
  /** Clause map from contract segmentation (required when outputMode is 'contract-review') */
  clauseMap?: ClauseMap;
}

/**
 * Result from Legal Department execution
 */
export interface LegalDepartmentResult {
  taskId: string;
  status: 'completed' | 'failed';
  userMessage: string;
  response?: string;
  error?: string;
  duration: number;
  // Specialist analysis data for frontend consumption
  specialistOutputs?: {
    contract?: ContractAnalysisOutput;
    compliance?: ComplianceAnalysisOutput;
    ip?: IpAnalysisOutput;
    privacy?: PrivacyAnalysisOutput;
    employment?: EmploymentAnalysisOutput;
    corporate?: CorporateAnalysisOutput;
    litigation?: LitigationAnalysisOutput;
    realEstate?: RealEstateAnalysisOutput;
  };
  documentsMetadata?: LegalDocumentMetadata[];
  routingDecision?: RoutingDecision;
  redlineOutput?: RedlineOutput;
  // Legal research workflow data
  researchTree?: import('./workflows/legal-research/legal-research.state').ResearchTreeNode[];
  memo?: string;
  tokenUsage?: { input: number; output: number };
  // Adversarial brief workflow data
  stressTestReport?: import('./workflows/adversarial-brief/adversarial-brief.state').StressTestReport;
  debateTranscript?: import('./workflows/adversarial-brief/adversarial-brief.state').DebateRound[];
  fortifiedBrief?: string;
  // Compliance audit workflow data
  findings?: import('./workflows/compliance-audit/compliance-audit.types').ComplianceFinding[];
  scorecard?: import('./workflows/compliance-audit/compliance-audit.types').ComplianceScorecard;
  remediationPlan?: import('./workflows/compliance-audit/compliance-audit.types').RemediationItem[];
  // Deal-memo workflow data
  memoMarkdown?: string;
  sectionCitations?: import('./workflows/deal-memo/deal-memo.types').DealMemoJobResult['sectionCitations'];
  artifactPath?: string;
  docxArtifactPath?: string;
  // Deposition-prep workflow data
  preparationOutline?: import('./workflows/deposition-prep/deposition-prep.state').PreparationOutlineOutput;
  predictedQuestions?: import('./workflows/deposition-prep/deposition-prep.state').PredictedQuestionSet[];
  answerCoaching?: import('./workflows/deposition-prep/deposition-prep.state').AnswerCoachingOutput;
  // Cross-exam simulation workflow data
  debrief?: import('./workflows/cross-exam-simulation/cross-exam-simulation.types').SimulationDebrief;
}

/**
 * Status response for checking thread state
 */
export interface LegalDepartmentStatus {
  taskId: string;
  status: LegalDepartmentState['status'];
  userMessage: string;
  response?: string;
  error?: string;
}

/**
 * Legal Department State Annotation
 *
 * Uses ExecutionContext for all identification and configuration.
 * No individual fields for taskId, userId, etc.
 *
 * Phase 3 (M0): Simple echo workflow to prove LLM integration works
 * Future phases will add:
 * - Document analysis
 * - Legal metadata extraction
 * - Multi-document comparison
 * - Compliance checking
 */
export const LegalDepartmentStateAnnotation = Annotation.Root({
  // Include message history from LangGraph
  ...MessagesAnnotation.spec,

  // ExecutionContext - the core context that flows through the system
  // Note: Default is a placeholder that MUST be overwritten when invoking the graph.
  // Runtime validation happens in graph nodes, not at state initialization.
  executionContext: Annotation<ExecutionContext>({
    reducer: (_, next) => next,
    default: () => ({
      orgSlug: '',
      userId: '',
      conversationId: '',
      agentSlug: '',
      agentType: '',
      provider: '',
      model: '',
    }),
  }),

  // User's message/prompt
  userMessage: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // Optional: Documents for legal analysis (M0: not processed, placeholder for future)
  documents: Annotation<
    Array<{
      name: string;
      content: string;
      type?: string;
    }>
  >({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // Legal metadata from document processing — one entry per document (Phase 3).
  // Index-aligned with `documents`: documentsMetadata[i] corresponds to documents[i].
  documentsMetadata: Annotation<LegalDocumentMetadata[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // CLO Routing decision (M3-M10: single specialist, M11+: multiple specialists)
  routingDecision: Annotation<RoutingDecision | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Multi-agent orchestration (M11+)
  // Track which specialists need to be invoked and which have completed
  orchestration: Annotation<{
    specialists?: string[]; // List of specialists to invoke
    completed?: string[]; // List of specialists that have completed
    failed?: string[]; // List of specialists that failed
    synthesis?: SynthesisOutput; // Combined synthesis of all specialist outputs
    hitlApproved?: boolean; // Whether HITL checkpoint was approved
    hitlApprovedAt?: string; // Timestamp of HITL approval
    hitlDecision?: ReviewDecisionPayload; // Most recent attorney review decision
  }>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  // Specialist outputs from M2-M10 agents
  // Each specialist adds their analysis to this object
  specialistOutputs: Annotation<{
    contract?: ContractAnalysisOutput;
    compliance?: ComplianceAnalysisOutput;
    ip?: IpAnalysisOutput;
    privacy?: PrivacyAnalysisOutput;
    employment?: EmploymentAnalysisOutput;
    corporate?: CorporateAnalysisOutput;
    litigation?: LitigationAnalysisOutput;
    realEstate?: RealEstateAnalysisOutput;
  }>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  // Contract review output mode: 'analysis' (default) or 'contract-review'
  outputMode: Annotation<'analysis' | 'contract-review'>({
    reducer: (_, next) => next,
    default: () => 'analysis',
  }),

  // Clause map from contract segmentation (contract-review mode only)
  clauseMap: Annotation<ClauseMap | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Redline output from synthesis (contract-review mode only)
  redlineOutput: Annotation<RedlineOutput | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Final response
  response: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Status tracking
  status: Annotation<'started' | 'processing' | 'completed' | 'failed'>({
    reducer: (_, next) => next,
    default: () => 'started',
  }),

  error: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // Workflow metadata
  startedAt: Annotation<number>({
    reducer: (_, next) => next,
    default: () => Date.now(),
  }),

  completedAt: Annotation<number | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
});

export type LegalDepartmentState = typeof LegalDepartmentStateAnnotation.State;
