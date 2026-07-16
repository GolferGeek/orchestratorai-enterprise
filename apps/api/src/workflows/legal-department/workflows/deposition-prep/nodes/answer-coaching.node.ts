/**
 * Answer Coaching Node — for each predicted question, produces an answer
 * framework, danger zones, follow-up handling, and "don't recall" assessment.
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';
import type {
  DepositionPrepState,
  AnswerCoachingOutput,
} from '../deposition-prep.state';

const ANSWER_COACHING_SYSTEM_PROMPT = `You are a deposition preparation coach. For each cross-examination question, provide answer coaching to help the witness respond effectively.

For each question, provide:
- answerFramework: A framework for structuring the answer (NOT a script). Focus on principles: what to acknowledge, what to avoid, what to be precise about.
- dangerZones: Specific phrases, admissions, or directions this answer could go that would be harmful.
- followupHandling: How to handle the anticipated follow-up if the witness's answer is weak or evasive.
- dontRecallAssessment: Whether "I don't recall" is safe (genuinely not memorable), dangerous (witness clearly should know), or context-dependent (depends on framing).

Respond ONLY with valid JSON as an object where keys are question indices (0-based) matching this schema:
{
  "0": {
    "answerFramework": "...",
    "dangerZones": ["...", "..."],
    "followupHandling": "...",
    "dontRecallAssessment": "safe" | "dangerous" | "context-dependent"
  },
  "1": { ... }
}`;

export function createAnswerCoachingNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function answerCoachingNode(
    state: DepositionPrepState,
  ): Promise<Partial<DepositionPrepState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Generating answer coaching for predicted questions',
      { step: 'answer_coaching', progress: 85 },
    );

    const { input, predictedQuestions } = state;

    if (!predictedQuestions || predictedQuestions.length === 0) {
      return {
        error: 'No predicted questions available for answer coaching',
        status: 'failed',
      };
    }

    const questionsText = predictedQuestions
      .map(
        (q, i) =>
          `[${i}] (${q.category}) ${q.question}${q.expectedFollowup ? `\n    Follow-up: ${q.expectedFollowup}` : ''}`,
      )
      .join('\n');

    const userMessage = `WITNESS BACKGROUND:\n${input.witnessBackground}

WITNESS TYPE: ${input.witnessType}
${input.priorStatements ? `\nPRIOR STATEMENTS:\n${input.priorStatements}` : ''}

PREDICTED QUESTIONS TO COACH ON (indices 0-${predictedQuestions.length - 1}):
${questionsText}`;

    const response = await callLLMMaybeWithReasoning(llmClient, {
      context: ctx,
      systemMessage: ANSWER_COACHING_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.1,
      maxTokens: 8000,
      callerName: 'deposition-prep:answer-coaching',
    });

    let answerCoaching: AnswerCoachingOutput;
    try {
      answerCoaching = JSON.parse(
        stripMarkdownFences(response.text),
      ) as AnswerCoachingOutput;
    } catch {
      return {
        error: `Failed to parse answer coaching as JSON: ${response.text.slice(0, 200)}`,
        status: 'failed',
      };
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Answer coaching complete: ${Object.keys(answerCoaching).length} questions coached`,
      { step: 'answer_coaching_complete', progress: 95 },
    );

    return { answerCoaching };
  };
}
