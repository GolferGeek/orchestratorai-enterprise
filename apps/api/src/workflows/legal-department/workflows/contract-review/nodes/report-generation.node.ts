/**
 * Contract-review report generation — produces risk assessment markdown
 * and preserves the final RedlineOutput with clause decisions applied.
 *
 * Produces two outputs:
 * 1. state.response — Risk assessment markdown report (executive summary)
 * 2. state.redlineOutput — Final redline data with accepted/rejected/modified clauses
 */
import { LegalDepartmentState } from '../../../legal-department.state';
import type { RedlineOutput } from '../../../legal-department.types';
import { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../../../shared/services/observability.service';
import {
  loadWorkflowMemory,
  formatMemoryForPrompt,
} from '../../../nodes/specialist-utils';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';

const AGENT_SLUG = 'legal-department';

export function createContractReviewReportNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function reportGenerationNode(
    state: LegalDepartmentState,
  ): Promise<Partial<LegalDepartmentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Contract Review Report: Generating risk assessment',
      { step: 'cr_report', progress: 90 },
    );

    try {
      const redlineOutput = state.redlineOutput;
      if (!redlineOutput) {
        return {
          error: 'No redline output available for report generation',
          status: 'failed',
        };
      }

      // Generate the risk assessment markdown report via LLM
      const memory = await loadWorkflowMemory('contract-review');
      const systemMessage = buildReportPrompt() + formatMemoryForPrompt(memory);
      const userMessage = buildReportUserMessage(state, redlineOutput);

      const response = await callLLMMaybeWithReasoning(llmClient, {
        context: ctx,
        systemMessage,
        userMessage,
        callerName: `${AGENT_SLUG}:cr-report-generation`,
        temperature: 0.4,
        maxTokens: 5000,
      });

      const riskAssessmentReport = response.text.trim();

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Contract Review Report: Complete',
        { step: 'cr_report_complete', progress: 95 },
      );

      return {
        response: riskAssessmentReport,
        // redlineOutput is already on state (updated by HITL with decisions)
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        `Contract Review Report failed: ${msg}`,
        Date.now() - state.startedAt,
      );

      return {
        error: `Contract Review Report: ${msg}`,
        status: 'failed',
      };
    }
  };
}

function buildReportPrompt(): string {
  return `You are a Chief Legal Officer preparing a contract review risk assessment report.

Generate a professional Markdown report that summarizes the contract review findings organized by risk level.

REPORT STRUCTURE:
# Contract Review — Risk Assessment

## Executive Summary
[2-3 paragraphs summarizing overall risk, key concerns, and recommended actions]

## Risk Overview
| Risk Level | Clauses | Percentage |
|------------|---------|------------|
[Table with critical/high/medium/low/acceptable counts]

## Critical & High Risk Findings
[Each flagged clause with its risk, finding, and suggested changes — ordered by severity]

## Recommendations
1. **[Priority 1]**: [Specific action]
[numbered list]

## Clause-by-Clause Summary
[Brief table or list of all clauses with their risk levels]

OUTPUT: Generate ONLY the Markdown report. No preamble.`;
}

function buildReportUserMessage(
  state: LegalDepartmentState,
  redlineOutput: RedlineOutput,
): string {
  let msg = 'Generate contract review risk assessment report based on:\n\n';

  // Document info
  const docs = state.documents ?? [];
  if (docs.length > 0) {
    msg += `Document: ${docs[0]!.name}\n`;
    const meta = state.documentsMetadata?.[0];
    if (meta?.documentType?.type) {
      msg += `Type: ${meta.documentType.type}\n`;
    }
    if (meta?.parties?.contractingParties) {
      const names = meta.parties.contractingParties
        .map((p) => p?.name)
        .filter(Boolean);
      if (names.length > 0) msg += `Parties: ${names.join(' and ')}\n`;
    }
    msg += '\n';
  }

  // Risk breakdown
  msg += `## Risk Breakdown\n`;
  msg += `- Critical: ${redlineOutput.riskBreakdown.critical}\n`;
  msg += `- High: ${redlineOutput.riskBreakdown.high}\n`;
  msg += `- Medium: ${redlineOutput.riskBreakdown.medium}\n`;
  msg += `- Low: ${redlineOutput.riskBreakdown.low}\n`;
  msg += `- Acceptable: ${redlineOutput.riskBreakdown.acceptable}\n`;
  msg += `- Total: ${redlineOutput.totalClauses}, Flagged: ${redlineOutput.flaggedClauses}\n\n`;

  // Flagged clauses
  const flagged = redlineOutput.clauses.filter(
    (c) => c.overallRisk !== 'acceptable',
  );
  if (flagged.length > 0) {
    msg += `## Flagged Clauses\n\n`;
    for (const clause of flagged) {
      msg += `### [${clause.clauseId}] — ${clause.overallRisk.toUpperCase()}\n`;
      msg += `Original: ${clause.originalText.slice(0, 200)}${clause.originalText.length > 200 ? '...' : ''}\n`;
      msg += `Summary: ${clause.summary}\n`;
      if (clause.suggestedRedline) {
        msg += `Suggested: ${clause.suggestedRedline.slice(0, 200)}${clause.suggestedRedline.length > 200 ? '...' : ''}\n`;
      }
      msg += `Annotations: ${clause.annotations.length} specialist(s) flagged\n\n`;
    }
  }

  return msg;
}
