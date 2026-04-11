/**
 * Research Node — core research unit.
 *
 * For the current sub-question:
 * 1. Queries WorkflowRagService.getContext() with the sub-question
 * 2. Calls LLM with RAG context to produce findings, citations,
 *    newSubQuestions, and confidence
 *
 * Phase 2: citation cross-referencing against RAG results. Citations
 * traceable to a RAG chunk are verified: true; others verified: false.
 *
 * Domain-agnostic recursion mechanics; legal-specific prompting in system
 * prompt only.
 *
 * See: PRD §4.1 — research_node
 */
import type { LegalResearchState, Citation } from '../legal-research.state';
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import type { WorkflowRagService } from '../../../../shared/services/workflow-rag.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import {
  loadWorkflowMemory,
  formatMemoryForPrompt,
  stripMarkdownFences,
} from '../../../nodes/specialist-utils';

const AGENT_SLUG = 'legal-department';

interface ResearchOutput {
  findings: string;
  citations: Array<{
    text: string;
    source: string;
    documentId?: string;
    chunkId?: string;
    relevanceScore?: number;
  }>;
  newSubQuestions: string[];
  confidence: 'high' | 'medium' | 'low';
}

export function createResearchNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  workflowRag?: WorkflowRagService,
) {
  return async function researchNode(
    state: LegalResearchState,
  ): Promise<Partial<LegalResearchState>> {
    const ctx = state.executionContext;
    const targetId = state.currentResearchTarget;

    if (!targetId) {
      return { error: 'No research target set', status: 'failed' };
    }

    const targetNode = state.researchTree.find((n) => n.id === targetId);
    if (!targetNode) {
      return {
        error: `Research target ${targetId} not found in tree`,
        status: 'failed',
      };
    }

    try {
      // Query RAG — global search across all org collections in one vector query
      let ragContext = '';
      if (workflowRag) {
        ragContext = await workflowRag.globalSearch({
          orgSlug: ctx.orgSlug,
          query: targetNode.question,
          topK: 8,
        });
      }

      const memory = await loadWorkflowMemory('legal-research');
      const systemMessage =
        buildSystemPrompt(ragContext) + formatMemoryForPrompt(memory);
      const userMessage = buildUserMessage(state, targetNode);

      const response = await callLLMMaybeWithReasoning(llmClient, {
        context: ctx,
        systemMessage,
        userMessage,
        callerName: `${AGENT_SLUG}:lr-research`,
        temperature: 0.3,
        maxTokens: 4000,
      });

      const parsed = JSON.parse(
        stripMarkdownFences(response.text),
      ) as ResearchOutput;

      // Phase 2: cross-reference citations against RAG results.
      // Extract source names from RAG context (format: "[filename] content")
      const ragSources = extractRagSources(ragContext);
      const citations: Citation[] = parsed.citations.map((c) => ({
        text: c.text,
        source: c.source,
        documentId: c.documentId ?? '',
        chunkId: c.chunkId ?? '',
        verified: verifyCitation(c, ragSources, ragContext),
        relevanceScore: c.relevanceScore ?? 0.5,
      }));

      // Cap new sub-questions
      const maxSub = state.researchConfig.maxSubQuestionsPerLevel;
      const newSubQuestions = parsed.newSubQuestions.slice(0, maxSub);

      // Update the target node in the tree with findings
      const tree = state.researchTree.map((n) =>
        n.id === targetId
          ? {
              ...n,
              status: 'answered' as const,
              findings: parsed.findings,
              citations,
              confidence: parsed.confidence,
            }
          : n,
      );

      // Track token usage
      const tokenUsage = {
        input: state.tokenUsage.input + (response.usage?.promptTokens ?? 0),
        output:
          state.tokenUsage.output + (response.usage?.completionTokens ?? 0),
      };

      await observability.emitProgress(
        ctx,
        ctx.conversationId,
        `Research complete for "${targetNode.question.slice(0, 60)}" — confidence: ${parsed.confidence}, ${newSubQuestions.length} new sub-questions`,
        {
          step: 'lr_research_complete',
          progress: 35,
          nodeId: targetId,
          confidence: parsed.confidence,
          citationCount: citations.length,
          newSubQuestionCount: newSubQuestions.length,
          tokenUsage,
        },
      );

      return {
        researchTree: tree,
        tokenUsage,
        // Store new sub-questions temporarily — depth_controller will add them to the tree
        pendingQuestions: newSubQuestions,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await observability.emitFailed(
        ctx,
        ctx.conversationId,
        `Research node failed for "${targetNode.question.slice(0, 60)}": ${msg}`,
        Date.now() - state.startedAt,
      );
      return { error: `Research node: ${msg}`, status: 'failed' };
    }
  };
}

function buildSystemPrompt(ragContext: string): string {
  return `You are a legal research specialist conducting depth-first legal research.

You are researching a specific sub-question as part of a larger legal research workflow.

${ragContext ? `REFERENCE MATERIAL FROM KNOWLEDGE BASE:\n${ragContext}\n\nIMPORTANT: The reference material above is formatted as [filename] followed by content. Use the exact filename in brackets as the "source" value in your citations. For example, if you see "[conflict-of-interest-policy.md] Section 2.1 requires...", your citation source should be "conflict-of-interest-policy.md".\n\n` : ''}CITATION RULES:
- Cite from the provided reference material above whenever possible
- Use the exact filename from the [brackets] as the "source" value
- You may also cite well-known legal authorities (statutes, model rules, case law) from your general knowledge — these will be marked as unverified
- If the provided context does not contain relevant material, state what you found from general knowledge and note the limitation
- Every citation from the reference material must use the exact bracketed filename as its source

OUTPUT FORMAT (JSON only, no markdown):
{
  "findings": "2-4 paragraph summary of research findings for this sub-question. Distinguish between what you found in the firm's knowledge base vs general legal knowledge.",
  "citations": [
    {
      "text": "The cited passage or legal principle",
      "source": "exact-filename-from-brackets.md (for knowledge base) or descriptive name (for general knowledge)",
      "documentId": "RAG document ID if available, empty string otherwise",
      "chunkId": "RAG chunk ID if available, empty string otherwise",
      "relevanceScore": 0.85
    }
  ],
  "newSubQuestions": ["0-3 emergent sub-questions that need further research"],
  "confidence": "high | medium | low"
}

CONFIDENCE LEVELS:
- high: Strong, well-supported answer with multiple citations
- medium: Partial answer, some citations, further research may help
- low: Weak answer, few or no citations, topic poorly covered in knowledge base

OUTPUT: Generate ONLY the JSON. No preamble.`;
}

function buildUserMessage(
  state: LegalResearchState,
  targetNode: { question: string; depth: number; parentId: string | null },
): string {
  let msg = `Sub-Question: ${targetNode.question}\n`;
  msg += `Depth: ${targetNode.depth}\n`;

  if (state.jurisdiction) msg += `Jurisdiction: ${state.jurisdiction}\n`;
  if (state.practiceArea) msg += `Practice Area: ${state.practiceArea}\n`;
  if (state.keyFacts) msg += `Key Facts: ${state.keyFacts}\n`;

  // Provide context from parent node
  if (targetNode.parentId) {
    const parent = state.researchTree.find((n) => n.id === targetNode.parentId);
    if (parent?.findings) {
      msg += `\nParent Research Context:\nQuestion: ${parent.question}\nFindings: ${parent.findings.slice(0, 500)}\n`;
    }
  }

  return msg;
}

/**
 * Extract source document names from RAG context.
 * RAG context format: "[filename] content\n\n[filename2] content2"
 */
function extractRagSources(ragContext: string): Set<string> {
  const sources = new Set<string>();
  if (!ragContext) return sources;
  const matches = ragContext.matchAll(/\[([^\]]+)\]/g);
  for (const match of matches) {
    sources.add(match[1]!.toLowerCase());
  }
  return sources;
}

/**
 * Verify a citation against RAG results.
 * A citation is verified if:
 * 1. Its source matches a document name from RAG results, OR
 * 2. Its cited text appears (partially) in the RAG context
 *
 * If no RAG context was provided, all citations are unverified.
 */
function verifyCitation(
  citation: { text: string; source: string; documentId?: string },
  ragSources: Set<string>,
  ragContext: string,
): boolean {
  if (!ragContext) return false;

  // Check if source name matches a RAG document
  const sourceMatch = ragSources.has(citation.source.toLowerCase());
  if (sourceMatch) return true;

  // Check if cited text appears in RAG context (content overlap)
  // Use a reasonable substring to check for overlap
  const textSnippet = citation.text.slice(0, 100).toLowerCase();
  if (
    textSnippet.length > 20 &&
    ragContext.toLowerCase().includes(textSnippet)
  ) {
    return true;
  }

  return false;
}
