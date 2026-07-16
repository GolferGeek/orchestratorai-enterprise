/**
 * Cross-Exam Generation Node — generates predicted questions opposing counsel
 * will ask, organized by category with expected follow-ups.
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';
import type {
  DepositionPrepState,
  PredictedQuestionSet,
} from '../deposition-prep.state';

const CROSS_EXAM_GENERATION_SYSTEM_PROMPT = `You are an expert deposition strategist playing the role of opposing counsel. Generate the predicted cross-examination questions for this witness.

Generate questions in four categories:
1. **opening** — rapport-building and foundational questions (background, role, expertise)
2. **core-substance** — direct examination of the facts at issue
3. **confrontation** — using specific documents or prior statements to challenge the witness
4. **trap** — questions designed to lock in damaging admissions or expose contradictions

For each question, provide an expectedFollowup that opposing counsel will ask if the witness struggles or gives an evasive answer.

Respond ONLY with valid JSON as an array matching this schema:
[
  {
    "category": "opening" | "core-substance" | "confrontation" | "trap",
    "question": "...",
    "expectedFollowup": "..."
  }
]

Generate 3-4 questions per category (12-16 total). Confrontation questions MUST reference specific prior statements or documents.`;

export function createCrossExamGenerationNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function crossExamGenerationNode(
    state: DepositionPrepState,
  ): Promise<Partial<DepositionPrepState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Generating predicted cross-examination questions',
      { step: 'cross_exam_generation', progress: 65 },
    );

    const { input, caseAnalysis, opposingPerspective } = state;

    const vulnerabilities = opposingPerspective
      ? `\n\nWITNESS VULNERABILITIES (priority order):\n${opposingPerspective.witnessVulnerabilities.map((v, i) => `${i + 1}. ${v}`).join('\n')}`
      : '';

    const goals = opposingPerspective
      ? `\n\nOPPOSING COUNSEL'S GOALS:\n${opposingPerspective.depositionGoals.map((g) => `- ${g}`).join('\n')}`
      : '';

    const availableDocs = opposingPerspective?.availableDocuments?.length
      ? `\n\nDOCUMENTS OPPOSING COUNSEL HAS:\n${opposingPerspective.availableDocuments.map((d) => `- ${d}`).join('\n')}`
      : '';

    const themes = caseAnalysis
      ? `\n\nKEY CASE THEMES:\n${caseAnalysis.themes.map((t) => `- ${t.description}`).join('\n')}`
      : '';

    const userMessage = `CASE FACTS:\n${input.caseFacts}

WITNESS BACKGROUND:\n${input.witnessBackground}

WITNESS TYPE: ${input.witnessType}
${input.priorStatements ? `\nPRIOR STATEMENTS:\n${input.priorStatements}` : ''}${themes}${vulnerabilities}${goals}${availableDocs}`;

    const response = await callLLMMaybeWithReasoning(llmClient, {
      context: ctx,
      systemMessage: CROSS_EXAM_GENERATION_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.3,
      maxTokens: 5000,
      callerName: 'deposition-prep:cross-exam-generation',
    });

    let predictedQuestions: PredictedQuestionSet[];
    try {
      predictedQuestions = JSON.parse(
        stripMarkdownFences(response.text),
      ) as PredictedQuestionSet[];
    } catch {
      return {
        error: `Failed to parse cross-exam questions as JSON: ${response.text.slice(0, 200)}`,
        status: 'failed',
      };
    }

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Generated ${predictedQuestions.length} predicted cross-examination questions`,
      { step: 'cross_exam_generation_complete', progress: 75 },
    );

    return { predictedQuestions };
  };
}
