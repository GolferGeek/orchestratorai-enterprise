/**
 * Report Generation node — polishes the approved memo into a final
 * legal memorandum format.
 *
 * See: PRD §4.1 — report_generation
 */
import type { LegalResearchState } from '../legal-research.state';
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import {
  loadWorkflowMemory,
  formatMemoryForPrompt,
} from '../../../nodes/specialist-utils';

const AGENT_SLUG = 'legal-department';

export function createReportGenerationNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function reportGenerationNode(
    state: LegalResearchState,
  ): Promise<Partial<LegalResearchState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Generating final legal research report',
      { step: 'lr_report_generation', progress: 80 },
    );

    try {
      if (!state.memo) {
        return {
          error: 'No memo available for report generation',
          status: 'failed',
        };
      }

      const memory = await loadWorkflowMemory('legal-research');
      const systemMessage = buildSystemPrompt() + formatMemoryForPrompt(memory);
      const userMessage = buildUserMessage(state);

      const response = await callLLMMaybeWithReasoning(llmClient, {
        context: ctx,
        systemMessage,
        userMessage,
        callerName: `${AGENT_SLUG}:lr-report-generation`,
        temperature: 0.4,
        maxTokens: 8000,
      });

      const report = response.text.trim();

      // Track token usage
      const tokenUsage = {
        input: state.tokenUsage.input + (response.usage?.promptTokens ?? 0),
        output:
          state.tokenUsage.output + (response.usage?.completionTokens ?? 0),
      };

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Final report generated',
        { step: 'lr_report_complete', progress: 90 },
      );

      return { report, tokenUsage };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        `Report generation failed: ${msg}`,
        Date.now() - state.startedAt,
      );
      return { error: `Report generation: ${msg}`, status: 'failed' };
    }
  };
}

function buildSystemPrompt(): string {
  return `You are a senior legal editor polishing a legal research memorandum into final format.

Take the draft memorandum and produce a polished, professional legal memo with proper structure.

FINAL MEMO STRUCTURE (Markdown):

# Legal Research Memorandum

**Date:** [Current date]
**Re:** [Subject matter]
**Jurisdiction:** [Applicable jurisdiction(s)]

---

## I. Issues Presented
[Numbered list of legal issues]

## II. Brief Answers
[Concise answer to each issue — one paragraph each]

## III. Discussion

### A. [First Issue]
[Full legal analysis with citations]

### B. [Second Issue]
[Full legal analysis with citations]

[Continue for all issues...]

## IV. Conclusion
[Summary of findings and recommended course of action]

## V. Limitations and Open Questions
[Scope statement, unresolved items, areas needing further research]

---
*This memorandum was prepared using AI-assisted legal research. All citations should be independently verified before reliance in legal proceedings.*

RULES:
- Preserve all citations from the draft exactly as they appear
- Maintain verified/unverified status on citations
- Improve clarity and organization but do not change substantive conclusions
- Use proper legal memo formatting conventions
- The scope limitation must appear prominently

OUTPUT: Generate ONLY the final Markdown memo. No preamble.`;
}

function buildUserMessage(state: LegalResearchState): string {
  let msg = `Please polish the following draft memorandum into final format.\n\n`;
  msg += `Original Question: ${state.userMessage}\n`;
  if (state.jurisdiction) msg += `Jurisdiction: ${state.jurisdiction}\n`;
  if (state.practiceArea) msg += `Practice Area: ${state.practiceArea}\n`;
  msg += `\n---\n\nDRAFT MEMORANDUM:\n\n${state.memo}`;
  return msg;
}
