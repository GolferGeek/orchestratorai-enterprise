import { LegalDepartmentState } from '../legal-department.state';
import { LLMHttpClientService } from '../../shared/services/llm-http-client.service';
import { ObservabilityService } from '../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../shared/services/llm-maybe-reasoning.helper';
import { loadWorkflowMemory, formatMemoryForPrompt } from './specialist-utils';

const AGENT_SLUG = 'legal-department';

/**
 * Report Generation Node - M13
 *
 * Purpose: Generate polished Markdown report combining all analyses.
 *
 * This final node:
 * 1. Receives all specialist outputs and synthesis
 * 2. Calls LLM to generate executive summary report
 * 3. Structures report in Markdown format
 * 4. Returns final report in state
 *
 * M13 Report Structure:
 * - Executive Summary
 * - Document Overview
 * - Specialist Findings (organized by domain)
 * - Risk Matrix
 * - Recommendations
 * - Next Steps
 */
export function createReportGenerationNode(
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
      'Report Generation: Creating final report',
      { step: 'report_generation', progress: 90 },
    );

    try {
      // Build report prompt
      const memory = await loadWorkflowMemory('document-onboarding');
      const systemMessage = buildReportPrompt() + formatMemoryForPrompt(memory);
      const userMessage = buildReportUserMessage(state);

      // Emit pre-LLM event to keep SSE alive through Cloudflare
      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Report Generation: Generating executive report',
        { step: 'report_generation_llm_call', progress: 92 },
      );

      // Single LLM call to generate report — opt into reasoning capture
      const response = await callLLMMaybeWithReasoning(llmClient, {
        context: ctx,
        systemMessage,
        userMessage,
        callerName: `${AGENT_SLUG}:report-generation`,
        temperature: 0.4,
        maxTokens: 5000,
      });

      const finalReport = response.text.trim();
      if (!finalReport) {
        throw new Error('LLM returned an empty report');
      }

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Report Generation: Report complete',
        { step: 'report_complete', progress: 95 },
      );

      return {
        response: finalReport,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        `Report Generation failed: ${errorMessage}`,
        Date.now() - state.startedAt,
      );

      throw error;
    }
  };
}

/**
 * Build report generation prompt
 */
function buildReportPrompt(): string {
  return `You are a Chief Legal Officer preparing an executive legal analysis report.

Generate a comprehensive, professional Markdown report that synthesizes all legal specialist analyses.

The report will be rendered directly in a web application. It must be visually scannable in Markdown, not a wall of prose. Use short paragraphs, tables, bullets, and clear section hierarchy.

REPORT STRUCTURE:
# Legal Analysis Report

## Documents Analyzed
| # | Document | Type | Length |
|---|----------|------|--------|
[One row per document analyzed — name, detected type, character count]

## Executive Dashboard
| Overall Risk | Urgency | Attorney Review Focus | Recommended Next Workflow |
|--------------|---------|-----------------------|---------------------------|
[One concise row using High/Medium/Low style language]

## Executive Summary
[2 short paragraphs for executives. Start with the practical bottom line.]

## Document Overview
[Document type, parties, key dates, purpose — cover all documents when multiple are present]

## Priority Issues
| Priority | Issue | Why It Matters | Recommended Action |
|----------|-------|----------------|--------------------|
[3-6 rows ordered by practical importance]

## Specialist Findings

### [Specialist Name 1]
**Risk Level:** [High/Medium/Low]

- **Key finding:** [specific finding grounded in the document]
- **Relevant language or signal:** [clause, term, metadata, or document fact]
- **Recommended action:** [specific action]

### [Specialist Name 2]
[Same structure]

[... for each specialist]

## Risk Matrix
| Risk Area | Severity | Likelihood | Impact | Priority |
|-----------|----------|------------|--------|----------|
[Table rows]

## Recommendations
1. **[Priority 1]** — [Specific action, owner, and reason]
2. **[Priority 2]** — [Specific action, owner, and reason]
[... continue]

## Next Steps
- [ ] [Actionable step 1]
- [ ] [Actionable step 2]
[... continue]

## Appendix
### Analysis Metadata
- Analysis Date: [date]
- Specialists Consulted: [list]
- Overall Confidence: [percentage]

STYLE:
- Professional, clear, executive-appropriate language
- Use tables and bullet points for readability
- Highlight critical issues prominently
- Include specific, actionable recommendations
- Avoid legal jargon where possible; explain when necessary
- Do not bury the conclusion; make the first two sections useful to a busy partner or general counsel
- Tie findings to specific document signals rather than generic legal concepts
- Keep tables concise; if a cell needs a paragraph, rewrite it shorter

OUTPUT:
Generate ONLY the Markdown report. No preamble, no explanations outside the report.`;
}

/**
 * Build user message with all context
 */
function buildReportUserMessage(state: LegalDepartmentState): string {
  let message = 'Generate legal analysis report based on:\n\n';

  // Phase 3: document table covering all analyzed documents.
  const docs = state.documents ?? [];
  if (docs.length > 0) {
    message += `## Documents Analyzed\n`;
    message += `| # | Document | Type | Length |\n`;
    message += `|---|----------|------|--------|\n`;
    docs.forEach((doc, i) => {
      const meta = state.documentsMetadata?.[i];
      const type = meta?.documentType?.type ?? 'unknown';
      message += `| ${i + 1} | ${doc.name} | ${type} | ${doc.content.length} chars |\n`;
    });

    // Parties from first document's metadata (most relevant)
    const firstMeta = state.documentsMetadata?.[0];
    if (firstMeta?.parties?.contractingParties) {
      const [p1, p2] = firstMeta.parties.contractingParties;
      const names = [p1?.name, p2?.name].filter(Boolean);
      if (names.length > 0) {
        message += `\nPrimary Parties: ${names.join(' and ')}\n`;
      }
    }
    message += `\n`;
  }

  // Synthesis (if multi-agent)
  if (state.orchestration?.synthesis) {
    message += `## Executive Synthesis\n`;
    message += JSON.stringify(state.orchestration.synthesis, null, 2);
    message += `\n\n`;
  }

  // Specialist outputs
  if (state.specialistOutputs) {
    message += `## Specialist Analyses\n\n`;
    for (const [specialist, output] of Object.entries(
      state.specialistOutputs,
    )) {
      message += `### ${specialist.toUpperCase()}\n`;
      message += JSON.stringify(output, null, 2);
      message += `\n\n`;
    }
  }

  message += `\nGenerate the final Markdown report now.`;

  return message;
}
