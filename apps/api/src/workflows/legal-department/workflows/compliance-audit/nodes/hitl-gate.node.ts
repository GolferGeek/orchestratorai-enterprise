/**
 * Compliance Audit — HITL Gate (Pre-Report Review).
 *
 * Calls interrupt() presenting the compliance findings, scorecard,
 * and audit context for compliance officer review.
 *
 * Resume routing:
 * - approve → proceed to report_generation
 * - reject  → re-run evaluation with feedback (loops back to cross_reference_loop)
 * - modify  → merge overridden finding statuses into state.findings, then proceed
 *
 * See: docs/efforts/current/regulatory-compliance-audit/prd.md §4.1.1 (hitl_gate)
 */
import { interrupt } from '@langchain/langgraph';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { ReviewDecisionPayload } from '../../../jobs/legal-jobs.types';
import type { ComplianceAuditState } from '../compliance-audit.state';
import type {
  ComplianceFinding,
  ComplianceStatus,
} from '../compliance-audit.types';

export function createHitlGateNode(observability: ObservabilityService) {
  return async function hitlGateNode(
    state: ComplianceAuditState,
  ): Promise<Partial<ComplianceAuditState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'HITL Gate: Awaiting compliance officer review of findings',
      {
        step: 'ca_hitl_gate_start',
        progress: 80,
        reviewRequired: true,
      },
    );

    // Build the review payload for the compliance officer
    const reviewPayload = {
      gate: 'pre-report' as const,
      auditContext: state.auditContext,
      findings: state.findings,
      scorecard: state.scorecard,
      policySections: state.policySections,
      totalDocuments: state.documents.length,
      evaluationsCompleted: state.evaluationsCompleted.length,
      evaluationsFailed: Object.keys(state.evaluationsFailed).length,
    };

    // interrupt() throws GraphInterrupt on first run; returns decision on resume
    const decision = interrupt<typeof reviewPayload, ReviewDecisionPayload>(
      reviewPayload,
    );

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `HITL Gate: decision=${decision.decision}`,
      {
        step: 'ca_hitl_gate_complete',
        progress: 81,
        decision: decision.decision,
      },
    );

    // Handle each decision type
    switch (decision.decision) {
      case 'approve':
        return {
          hitlDecision: decision,
          status: 'generating_report',
        };

      case 'reject': {
        // Re-run evaluation with feedback. Rebuild the evaluation queue
        // from the existing policy sections so the cross-reference loop
        // re-evaluates everything with the reviewer's feedback context.
        const rebuiltQueue = state.policySections.map((section) => ({
          type: 'policy-section' as const,
          sectionId: section.sectionId,
          sectionText: section.sectionText,
          complianceDomain: section.complianceDomain ?? 'general',
        }));

        return {
          hitlDecision: decision,
          // Clear existing findings so re-evaluation starts fresh
          findings: [],
          evaluationQueue: rebuiltQueue,
          evaluationsCompleted: [],
          evaluationsFailed: {},
          scorecard: undefined,
          // Set status to evaluating so the graph routes back to cross_reference_loop
          status: 'evaluating',
        };
      }

      case 'modify': {
        // Apply overridden finding statuses from the reviewer.
        // editedOutputs.findings is an array of { id, status?, severity?, gapDescription? }
        // that override specific fields on matching findings.
        const overrides = (decision.editedOutputs?.findings ?? []) as Array<{
          id: string;
          status?: ComplianceStatus;
          severity?: ComplianceFinding['severity'];
          gapDescription?: string;
          remediationRecommendation?: string;
        }>;

        const overrideMap = new Map(overrides.map((o) => [o.id, o]));

        const mergedFindings = state.findings.map((finding) => {
          const override = overrideMap.get(finding.id);
          if (!override) return finding;
          return {
            ...finding,
            ...(override.status !== undefined && { status: override.status }),
            ...(override.severity !== undefined && {
              severity: override.severity,
            }),
            ...(override.gapDescription !== undefined && {
              gapDescription: override.gapDescription,
            }),
            ...(override.remediationRecommendation !== undefined && {
              remediationRecommendation: override.remediationRecommendation,
            }),
          };
        });

        return {
          hitlDecision: decision,
          findings: mergedFindings,
          status: 'generating_report',
        };
      }

      default:
        // Unknown decision — treat as approve to avoid blocking
        return {
          hitlDecision: decision,
          status: 'generating_report',
        };
    }
  };
}
