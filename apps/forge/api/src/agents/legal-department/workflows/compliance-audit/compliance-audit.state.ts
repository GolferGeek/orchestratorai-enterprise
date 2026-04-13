/**
 * Regulatory Compliance Audit — State Annotation.
 *
 * Separate state from other workflows because the compliance audit has
 * distinct needs: audit context, policy sections, evaluation queues,
 * compliance findings, scorecard, and remediation plan.
 *
 * See: docs/efforts/current/regulatory-compliance-audit/prd.md §4.2.1
 */
import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import type { ExecutionContext } from '@orchestrator-ai/transport-types';
import type { ReviewDecisionPayload } from '../../jobs/legal-jobs.types';
import type {
  AuditContext,
  PolicySection,
  EvaluationQueueEntry,
  ComplianceFinding,
  ComplianceScorecard,
  RemediationItem,
  ComplianceAuditStatus,
} from './compliance-audit.types';

// ── State Annotation ────────────────────────────────────────────────

export const ComplianceAuditStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,

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

  // --- Audit Context (set at intake) ---
  auditContext: Annotation<AuditContext>({
    reducer: (_, next) => next,
    default: () => ({
      mode: 'scan' as const,
      frameworkSlugs: [],
    }),
  }),

  // --- Documents ---
  documents: Annotation<
    Array<{
      documentId: string;
      name: string;
      content: string;
      mimeType?: string;
      sizeBytes: number;
    }>
  >({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // --- Policy Sections (built during ingestion) ---
  policySections: Annotation<PolicySection[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  policyCollectionSlug: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // --- Evaluation Queue ---
  evaluationQueue: Annotation<EvaluationQueueEntry[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  evaluationsCompleted: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  evaluationsFailed: Annotation<Record<string, string>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  // --- Findings ---
  findings: Annotation<ComplianceFinding[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  // --- Synthesis ---
  scorecard: Annotation<ComplianceScorecard | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  remediationPlan: Annotation<RemediationItem[] | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // --- Report ---
  report: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // --- HITL ---
  hitlDecision: Annotation<ReviewDecisionPayload | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  // --- Orchestration ---
  status: Annotation<ComplianceAuditStatus>({
    reducer: (_, next) => next,
    default: () => 'intake',
  }),

  error: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  startedAt: Annotation<number>({
    reducer: (_, next) => next,
    default: () => Date.now(),
  }),

  completedAt: Annotation<number | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
});

export type ComplianceAuditState = typeof ComplianceAuditStateAnnotation.State;
