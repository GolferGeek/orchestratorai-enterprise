/**
 * Deposition Synthesis Node — merges case analysis, generated questions, and
 * research findings into a structured preparation outline.
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';
import type {
  DepositionPrepState,
  PreparationOutlineOutput,
} from '../deposition-prep.state';

const SYNTHESIS_SYSTEM_PROMPT = `You are a senior litigator assembling the final deposition preparation outline. Synthesize the case analysis, generated questions, and research findings into a structured outline.

Produce:
1. **topics**: For each deposition topic, assign the relevant question set and organize logically.
2. **exhibitList**: Each exhibit with the recommended timing and suggested follow-up question.
3. **redFlags**: Specific risks or danger zones to avoid during the deposition.
4. **fallbackQuestions**: Generic safe questions to ask if a topic is shut down by opposing counsel.

Respond ONLY with valid JSON matching this schema:
{
  "topics": [
    {
      "title": "...",
      "questions": {
        "themeId": "...",
        "openEnded": [...],
        "followUp": [...],
        "confrontation": [...],
        "trap": [...]
      }
    }
  ],
  "exhibitList": [{ "name": "...", "timing": "...", "suggestedFollowUp": "..." }],
  "redFlags": ["..."],
  "fallbackQuestions": ["..."]
}`;

export function createDepositionSynthesisNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function depositionSynthesisNode(
    state: DepositionPrepState,
  ): Promise<Partial<DepositionPrepState>> {
    const ctx = state.executionContext;

    if (
      !state.caseAnalysis ||
      !state.generatedQuestions ||
      !state.researchFindings
    ) {
      return {
        error:
          'Missing required state for synthesis (caseAnalysis, generatedQuestions, researchFindings)',
        status: 'failed',
      };
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Synthesizing preparation outline from analysis, questions, and research',
      { step: 'deposition_synthesis', progress: 80 },
    );

    const userMessage = `CASE ANALYSIS:
Themes: ${JSON.stringify(state.caseAnalysis.themes)}
Inconsistencies: ${state.caseAnalysis.inconsistencies.join('; ')}
Legal Theories: ${state.caseAnalysis.legalTheories.join('; ')}
Exhibit Candidates: ${state.caseAnalysis.exhibitCandidates.join('; ')}

GENERATED QUESTIONS:
${JSON.stringify(state.generatedQuestions, null, 2)}

RESEARCH FINDINGS:
Strategies: ${state.researchFindings.caseStrategies.join('; ')}
Witness Evasion Tactics: ${state.researchFindings.evasionTactics.join('; ')}${state.researchFindings.opposingCounselStyle ? `\nOpposing Counsel Style: ${state.researchFindings.opposingCounselStyle}` : ''}

DEPOSITION TOPICS: ${state.input.depositionTopics.join(', ')}`;

    const response = await callLLMMaybeWithReasoning(llmClient, {
      context: ctx,
      systemMessage: SYNTHESIS_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.1,
      maxTokens: 6000,
      callerName: 'deposition-prep:deposition-synthesis',
    });

    let preparationOutline: PreparationOutlineOutput;
    try {
      preparationOutline = JSON.parse(
        stripMarkdownFences(response.text),
      ) as PreparationOutlineOutput;
    } catch {
      return {
        error: `Failed to parse synthesis response as JSON: ${response.text.slice(0, 200)}`,
        status: 'failed',
      };
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Preparation outline complete: ${preparationOutline.topics.length} topics, ${preparationOutline.exhibitList.length} exhibits, ${preparationOutline.redFlags.length} red flags`,
      { step: 'deposition_synthesis_complete', progress: 90 },
    );

    return { preparationOutline };
  };
}
