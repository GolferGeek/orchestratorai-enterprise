/**
 * Question Generation Node — for each theme identified in case analysis,
 * generates four question types: open-ended, follow-up, confrontation, and trap.
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';
import type {
  DepositionPrepState,
  QuestionSet,
} from '../deposition-prep.state';

const QUESTION_GENERATION_SYSTEM_PROMPT = `You are an experienced litigator generating deposition questions for a specific theme. For the given theme, generate four categories of questions:

1. **openEnded** (2-3): Open-ended questions that allow the witness to explain, establishing the record.
2. **followUp** (2-3): Follow-up questions that pin down specifics or limit escape routes.
3. **confrontation** (1-2): Questions that directly confront the witness with inconsistencies or damaging facts.
4. **trap** (1-2): Questions that box the witness in — where any answer is strategically useful.

For each question provide:
- question: the exact question text
- strategicPurpose: why you ask this question
- expectedWitnessResponse: what you anticipate the witness will say

Respond ONLY with valid JSON matching this schema:
{
  "themeId": "...",
  "openEnded": [{ "question": "...", "strategicPurpose": "...", "expectedWitnessResponse": "..." }],
  "followUp": [{ "question": "...", "strategicPurpose": "...", "expectedWitnessResponse": "..." }],
  "confrontation": [{ "question": "...", "strategicPurpose": "...", "expectedWitnessResponse": "..." }],
  "trap": [{ "question": "...", "strategicPurpose": "...", "expectedWitnessResponse": "..." }]
}`;

export function createQuestionGenerationNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function questionGenerationNode(
    state: DepositionPrepState,
  ): Promise<Partial<DepositionPrepState>> {
    const ctx = state.executionContext;

    if (!state.caseAnalysis) {
      return {
        error: 'Case analysis missing — cannot generate questions',
        status: 'failed',
      };
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Generating questions for ${state.caseAnalysis.themes.length} themes`,
      { step: 'question_generation', progress: 35 },
    );

    const { input, caseAnalysis } = state;

    const contextBlock = `CASE FACTS:\n${input.caseFacts}\n\nWITNESS: ${input.witnessBackground}\n\nWITNESS TYPE: ${input.witnessType}`;

    const questionSets: QuestionSet[] = [];

    for (const theme of caseAnalysis.themes) {
      const userMessage = `${contextBlock}

THEME TO DEVELOP:
ID: ${theme.id}
Description: ${theme.description}
Relevance: ${theme.relevance}

KNOWN INCONSISTENCIES: ${caseAnalysis.inconsistencies.join('; ') || 'none identified'}`;

      const response = await callLLMMaybeWithReasoning(llmClient, {
        context: ctx,
        systemMessage: QUESTION_GENERATION_SYSTEM_PROMPT,
        userMessage,
        temperature: 0.2,
        maxTokens: 3000,
        callerName: 'deposition-prep:question-generation',
      });

      let questionSet: QuestionSet;
      try {
        questionSet = JSON.parse(
          stripMarkdownFences(response.text),
        ) as QuestionSet;
      } catch {
        return {
          error: `Failed to parse question generation response for theme ${theme.id}: ${response.text.slice(0, 200)}`,
          status: 'failed',
        };
      }

      questionSets.push(questionSet);
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Generated ${questionSets.length} question sets (${questionSets.reduce((sum, qs) => sum + qs.openEnded.length + qs.followUp.length + qs.confrontation.length + qs.trap.length, 0)} total questions)`,
      { step: 'question_generation_complete', progress: 50 },
    );

    return { generatedQuestions: questionSets };
  };
}
