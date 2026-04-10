/**
 * Synthesis node — receives the complete research tree and produces a
 * structured legal memorandum organized by issue/sub-issue.
 *
 * See: PRD §4.1 — synthesis
 */
import type {
  LegalResearchState,
  ResearchTreeNode,
} from '../legal-research.state';
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import {
  loadWorkflowMemory,
  formatMemoryForPrompt,
} from '../../../nodes/specialist-utils';

const AGENT_SLUG = 'legal-department';

export function createSynthesisNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function synthesisNode(
    state: LegalResearchState,
  ): Promise<Partial<LegalResearchState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Synthesizing research findings into legal memorandum',
      { step: 'lr_synthesis', progress: 55 },
    );

    try {
      const memory = await loadWorkflowMemory('legal-research');
      const systemMessage = buildSystemPrompt() + formatMemoryForPrompt(memory);
      const userMessage = buildUserMessage(state);

      const response = await callLLMMaybeWithReasoning(llmClient, {
        context: ctx,
        systemMessage,
        userMessage,
        callerName: `${AGENT_SLUG}:lr-synthesis`,
        temperature: 0.4,
        maxTokens: 8000,
      });

      const memo = response.text.trim();

      // Track token usage
      const tokenUsage = {
        input: state.tokenUsage.input + (response.usage?.promptTokens ?? 0),
        output:
          state.tokenUsage.output + (response.usage?.completionTokens ?? 0),
      };

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        'Synthesis complete — legal memorandum generated',
        { step: 'lr_synthesis_complete', progress: 65 },
      );

      return { memo, tokenUsage };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        `Synthesis failed: ${msg}`,
        Date.now() - state.startedAt,
      );
      return { error: `Synthesis: ${msg}`, status: 'failed' };
    }
  };
}

function buildSystemPrompt(): string {
  return `You are a Chief Legal Officer synthesizing the results of a recursive legal research workflow into a structured legal memorandum.

MEMORANDUM STRUCTURE (Markdown):

# Legal Research Memorandum

## Scope Statement
Research scope limited to [N] documents in the organization's legal knowledge base.

## Issues Presented
[Numbered list of the key issues researched]

## Brief Answers
[Concise answer to each issue]

## Discussion

### Issue 1: [Title]
**Question:** [The sub-question]
**Answer:** [2-3 paragraphs of analysis]
**Reasoning:** [Legal reasoning and supporting authority]
**Citations:**
- [Citation 1] (verified/unverified)
- [Citation 2] (verified/unverified)
**Confidence:** [high/medium/low]

[Repeat for each issue...]

## Overall Confidence Assessment
[Summary of confidence across all issues]

## Open Questions
[Any unresolved items, insufficient-source areas, or topics requiring further research]

RULES:
- Organize by issue/sub-issue hierarchy, matching the research tree structure
- For each citation, note whether it is verified (from knowledge base) or unverified
- If any research branches were skipped or left pending (marked [SKIPPED] or [PENDING] in the tree), you MUST include an "Incomplete Research" section listing:
  - Each skipped/pending sub-question
  - The reason it was not researched (depth limit reached / token budget exhausted / time budget exceeded)
  - What additional research would be needed to address it
- State the scope limitation prominently
- Be honest about confidence levels — do not inflate confidence
- Unverified citations MUST be clearly marked with "(UNVERIFIED — not found in knowledge base)"

OUTPUT: Generate ONLY the Markdown memorandum. No preamble.`;
}

function buildUserMessage(state: LegalResearchState): string {
  const tree = state.researchTree;
  const answeredCount = tree.filter((n) => n.status === 'answered').length;
  const skippedCount = tree.filter((n) => n.status === 'skipped').length;
  const pendingCount = tree.filter((n) => n.status === 'pending').length;

  // Count total unique documents referenced in citations
  const documentIds = new Set<string>();
  for (const node of tree) {
    if (node.citations) {
      for (const c of node.citations) {
        if (c.documentId) documentIds.add(c.documentId);
      }
    }
  }

  let msg = `Original Question: ${state.userMessage}\n`;
  if (state.jurisdiction) msg += `Jurisdiction: ${state.jurisdiction}\n`;
  if (state.practiceArea) msg += `Practice Area: ${state.practiceArea}\n`;
  if (state.keyFacts) msg += `Key Facts: ${state.keyFacts}\n`;
  msg += `\nDocument count for scope statement: ${documentIds.size}\n`;
  msg += `Research stats: ${answeredCount} answered, ${skippedCount} skipped, ${pendingCount} still pending\n`;

  // If there are skipped/pending nodes, explain why (early synthesis)
  if (skippedCount > 0 || pendingCount > 0) {
    msg += `\n**NOTE: Research was terminated early.** `;
    const config = state.researchConfig;
    const elapsed = Date.now() - state.startedAt;
    const totalTokens = state.tokenUsage.input + state.tokenUsage.output;
    const reasons: string[] = [];
    if (config.maxDepth > 0) reasons.push(`max depth: ${config.maxDepth}`);
    if (config.tokenBudget && totalTokens >= config.tokenBudget)
      reasons.push(
        `token budget exhausted: ${totalTokens}/${config.tokenBudget}`,
      );
    if (config.timeBudgetMs && elapsed >= config.timeBudgetMs)
      reasons.push(
        `time budget exhausted: ${Math.round(elapsed / 1000)}s/${Math.round(config.timeBudgetMs / 1000)}s`,
      );
    if (reasons.length > 0) msg += `Limits hit: ${reasons.join(', ')}. `;
    msg += `Include an "Incomplete Research" section in the memo.\n`;
  }
  msg += '\n';

  msg += `## Research Tree\n\n`;
  msg += formatTreeForPrompt(tree);

  return msg;
}

function formatTreeForPrompt(tree: ResearchTreeNode[]): string {
  const root = tree.find((n) => n.parentId === null);
  if (!root) return 'Empty research tree';

  const lines: string[] = [];
  function walk(node: ResearchTreeNode, indent: number) {
    const prefix = '  '.repeat(indent);
    const statusIcon =
      node.status === 'answered'
        ? '[DONE]'
        : node.status === 'skipped'
          ? '[SKIPPED]'
          : node.status === 'pending'
            ? '[PENDING]'
            : '[RESEARCHING]';
    const confidence = node.confidence ? ` (${node.confidence})` : '';

    lines.push(`${prefix}${statusIcon}${confidence} ${node.question}`);

    if (node.findings) {
      lines.push(
        `${prefix}  Findings: ${node.findings.slice(0, 300)}${node.findings.length > 300 ? '...' : ''}`,
      );
    }
    if (node.citations && node.citations.length > 0) {
      lines.push(
        `${prefix}  Citations: ${node.citations.map((c) => `${c.source} (${c.verified ? 'verified' : 'UNVERIFIED'})`).join(', ')}`,
      );
    }

    for (const childId of node.childIds) {
      const child = tree.find((n) => n.id === childId);
      if (child) walk(child, indent + 1);
    }
  }

  walk(root, 0);
  return lines.join('\n');
}
