/**
 * Case Analysis Node — ingests case facts, witness background, topics, and
 * any uploaded documents to identify 3-5 themes, inconsistencies, legal
 * theories, and exhibit candidates.
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';
import type {
  DepositionPrepState,
  CaseAnalysisOutput,
} from '../deposition-prep.state';

const CASE_ANALYSIS_SYSTEM_PROMPT = `You are a litigation strategist preparing for a deposition. Analyze the provided case facts, witness background, and any uploaded documents to extract the deposition's strategic landscape.

Identify:
1. **Themes** (3-5): Recurring factual or legal threads this witness can speak to.
   - id: unique identifier (e.g., "theme-1")
   - description: what the theme is
   - relevance: why it matters to the case

2. **Inconsistencies**: Contradictions between the witness's known statements, documents, or case facts.

3. **Legal Theories**: Causes of action or defenses this witness's testimony could support or undermine.

4. **Exhibit Candidates**: Documents or items that should be introduced through this witness.

Respond ONLY with valid JSON matching this schema:
{
  "themes": [{ "id": "...", "description": "...", "relevance": "..." }],
  "inconsistencies": ["..."],
  "legalTheories": ["..."],
  "exhibitCandidates": ["..."]
}`;

export function createCaseAnalysisNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function caseAnalysisNode(
    state: DepositionPrepState,
  ): Promise<Partial<DepositionPrepState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Analyzing case facts, witness background, and documents',
      { step: 'case_analysis', progress: 15 },
    );

    const { input } = state;

    const documentSection =
      input.documents && input.documents.length > 0
        ? `\n\nUPLOADED DOCUMENTS:\n${input.documents.map((d) => `--- ${d.name} ---\n${d.content}`).join('\n\n')}`
        : '';

    const userMessage = `CASE FACTS:\n${input.caseFacts}

WITNESS BACKGROUND:\n${input.witnessBackground}

DEPOSITION TOPICS:\n${input.depositionTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}

WITNESS TYPE: ${input.witnessType}${input.priorStatements ? `\n\nPRIOR STATEMENTS:\n${input.priorStatements}` : ''}${documentSection}`;

    const response = await callLLMMaybeWithReasoning(llmClient, {
      context: ctx,
      systemMessage: CASE_ANALYSIS_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.1,
      maxTokens: 4000,
      callerName: 'deposition-prep:case-analysis',
    });

    let caseAnalysis: CaseAnalysisOutput;
    try {
      caseAnalysis = JSON.parse(
        stripMarkdownFences(response.text),
      ) as CaseAnalysisOutput;
    } catch {
      return {
        error: `Failed to parse case analysis response as JSON: ${response.text.slice(0, 200)}`,
        status: 'failed',
      };
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Case analyzed: ${caseAnalysis.themes.length} themes, ${caseAnalysis.inconsistencies.length} inconsistencies, ${caseAnalysis.exhibitCandidates.length} exhibit candidates`,
      { step: 'case_analysis_complete', progress: 25 },
    );

    return { caseAnalysis };
  };
}
