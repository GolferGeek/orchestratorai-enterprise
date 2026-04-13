/**
 * Regulatory Compliance Audit — Domain Types.
 *
 * Types specific to the compliance audit workflow: audit context, policy sections,
 * evaluation queue entries, compliance findings, scorecard, and remediation items.
 *
 * See: docs/efforts/current/regulatory-compliance-audit/prd.md §4.2.2
 */

export const COMPLIANCE_AUDIT_JOB_TYPE = 'compliance-audit';

// ── Audit Context ─────────────────────────────────────────────────

export type AuditMode = 'scan' | 'full-audit';

export interface AuditContext {
  mode: AuditMode;
  frameworkSlugs: string[];
  selectedThemes?: string[];
  organizationContext?: {
    industry?: string;
    jurisdiction?: string;
    employeeCount?: string;
  };
}

// ── Policy Sections ───────────────────────────────────────────────

export interface PolicySection {
  sectionId: string;
  documentId: string;
  documentName: string;
  sectionTitle: string;
  sectionText: string;
  complianceDomain?: string;
}

// ── Evaluation Queue ──────────────────────────────────────────────

export type EvaluationQueueEntry = PolicySectionEntry | ThemeQuestionEntry;

export interface PolicySectionEntry {
  type: 'policy-section';
  sectionId: string;
  sectionText: string;
  complianceDomain: string;
}

export interface ThemeQuestionEntry {
  type: 'theme-question';
  frameworkSlug: string;
  themeId: string;
  themeName: string;
  questionId: string;
  questionText: string;
}

// ── Compliance Findings ───────────────────────────────────────────

export type ComplianceStatus =
  | 'compliant'
  | 'partially-compliant'
  | 'non-compliant'
  | 'not-addressed'
  | 'unable-to-evaluate';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface PolicyCitation {
  sectionId: string;
  documentName: string;
  sectionTitle: string;
  excerpt: string;
}

export interface ComplianceFinding {
  id: string;
  status: ComplianceStatus;
  severity: Severity;
  frameworkSlug: string;
  requirementRef: string;
  requirementText: string;
  policyCitations: PolicyCitation[];
  gapDescription: string;
  remediationRecommendation: string;
  specialistReasoning: string;
  // Full Audit only
  themeId?: string;
  themeName?: string;
  questionId?: string;
}

// ── Scorecard ─────────────────────────────────────────────────────

export interface ThemeScore {
  themeId: string;
  themeName: string;
  frameworkSlug: string;
  totalQuestions: number;
  compliant: number;
  partiallyCompliant: number;
  nonCompliant: number;
  notAddressed: number;
  score: number;
}

export interface FrameworkScore {
  frameworkSlug: string;
  frameworkName: string;
  score: number;
  themeScores: ThemeScore[];
}

export interface ComplianceScorecard {
  overallScore: number;
  perFramework: FrameworkScore[];
}

// ── Remediation ───────────────────────────────────────────────────

export interface RemediationItem {
  findingId: string;
  priority: number;
  severity: Severity;
  effort: 'small' | 'medium' | 'large';
  description: string;
  requirement: string;
  currentState: string;
  recommendedAction: string;
}

// ── Status ────────────────────────────────────────────────────────

export type ComplianceAuditStatus =
  | 'intake'
  | 'ingesting'
  | 'evaluating'
  | 'awaiting_review'
  | 'generating_report'
  | 'completed'
  | 'failed';
