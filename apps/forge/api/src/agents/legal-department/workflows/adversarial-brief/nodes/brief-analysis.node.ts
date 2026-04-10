/**
 * Brief Analysis Node — parses the uploaded brief into structured arguments,
 * citations, and factual assertions.
 *
 * This is the first node in the adversarial-brief graph. It uses an LLM call
 * to extract the brief's logical structure, which Blue and Red teams then
 * operate on.
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import type {
  AdversarialBriefState,
  BriefStructure,
} from '../adversarial-brief.state';

const BRIEF_ANALYSIS_SYSTEM_PROMPT = `You are a legal document analyst. Your task is to parse a legal brief, motion, or memo into its structural components.

Extract the following from the provided document:

1. **Arguments**: Each distinct legal argument or claim made in the brief.
   - id: a unique identifier (e.g., "arg-1", "arg-2")
   - claim: the core assertion being made
   - support: the reasoning or evidence supporting the claim
   - citations: list of case law, statutes, or authorities cited for this argument

2. **Citations**: Every case, statute, regulation, or authority cited in the brief.
   - id: a unique identifier (e.g., "cite-1", "cite-2")
   - text: the citation as written (e.g., "Smith v. Jones, 123 F.3d 456 (9th Cir. 2020)")
   - source: the source document name
   - verified: false (verification happens later)

3. **Factual Assertions**: Key factual claims the brief relies on.
   - id: a unique identifier (e.g., "fact-1", "fact-2")
   - assertion: the factual claim
   - support: what evidence or testimony supports it

Respond ONLY with valid JSON matching this schema:
{
  "arguments": [...],
  "citations": [...],
  "factualAssertions": [...]
}`;

export function createBriefAnalysisNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function briefAnalysisNode(
    state: AdversarialBriefState,
  ): Promise<Partial<AdversarialBriefState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Analyzing brief structure: extracting arguments, citations, and factual assertions',
      { step: 'brief_analysis', progress: 10 },
    );

    // Combine all documents into a single brief text
    const briefText = state.documents
      .map((doc) => `--- ${doc.name} ---\n${doc.content}`)
      .join('\n\n');

    if (!briefText.trim()) {
      return {
        error: 'No brief content provided. Upload a brief to stress-test.',
        status: 'failed',
      };
    }

    const response = await callLLMMaybeWithReasoning(llmClient, {
      context: ctx,
      systemMessage: BRIEF_ANALYSIS_SYSTEM_PROMPT,
      userMessage: `Analyze this legal brief:\n\n${briefText}`,
      temperature: 0.1,
      maxTokens: 4000,
      callerName: 'adversarial-brief:brief-analysis',
    });

    let briefStructure: BriefStructure;
    try {
      briefStructure = JSON.parse(response.text) as BriefStructure;
    } catch {
      return {
        error: `Failed to parse brief analysis response as JSON: ${response.text.slice(0, 200)}`,
        status: 'failed',
      };
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Brief analyzed: ${briefStructure.arguments.length} arguments, ${briefStructure.citations.length} citations, ${briefStructure.factualAssertions.length} factual assertions`,
      { step: 'brief_analysis_complete', progress: 20 },
    );

    return {
      briefStructure,
      tokenUsage: {
        input: state.tokenUsage.input + (response.usage?.promptTokens ?? 0),
        output:
          state.tokenUsage.output + (response.usage?.completionTokens ?? 0),
      },
    };
  };
}
