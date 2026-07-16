/**
 * Regulatory Compliance Audit — Intake Node.
 *
 * Validates audit context (at least 1 framework selected), initializes
 * the workflow, and transitions status to 'ingesting'. The evaluation
 * queue is populated later — after ingest_policies (scan mode) or by
 * parsing theme configs (full-audit mode, Phase 3).
 *
 * See: docs/efforts/current/regulatory-compliance-audit/prd.md §4.1.1
 */
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { ComplianceAuditState } from '../compliance-audit.state';

export function createIntakeNode(observability: ObservabilityService) {
  return async function intakeNode(
    state: ComplianceAuditState,
  ): Promise<Partial<ComplianceAuditState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Initializing compliance audit: ${state.documents.length} documents, mode=${state.auditContext.mode}`,
      { step: 'ca_intake', progress: 2 },
    );

    // Validate audit context
    if (
      !state.auditContext.frameworkSlugs ||
      state.auditContext.frameworkSlugs.length === 0
    ) {
      return {
        status: 'failed',
        error:
          'Audit context is incomplete: at least one regulatory framework must be selected.',
      };
    }

    if (!state.documents || state.documents.length === 0) {
      return {
        status: 'failed',
        error:
          'No documents provided: at least one policy document must be uploaded.',
      };
    }

    const policyCollectionSlug = `compliance-audit-${ctx.conversationId}-policies`;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Audit initialized: ${state.documents.length} documents, frameworks=[${state.auditContext.frameworkSlugs.join(', ')}], mode=${state.auditContext.mode}`,
      {
        step: 'ca_intake_complete',
        progress: 5,
        totalDocuments: state.documents.length,
        mode: state.auditContext.mode,
        frameworks: state.auditContext.frameworkSlugs,
      },
    );

    return {
      policyCollectionSlug,
      evaluationsCompleted: [],
      evaluationsFailed: {},
      findings: [],
      status: 'ingesting',
    };
  };
}
