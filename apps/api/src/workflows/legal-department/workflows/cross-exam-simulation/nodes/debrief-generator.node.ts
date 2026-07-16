/**
 * Debrief Generator Node — assembles the full SimulationDebrief: merges
 * questions/answers/scores into a transcript, identifies weakest moments,
 * analyzes behavioral patterns via LLM, and generates coaching recommendations.
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';
import type { CrossExamSimulationState } from '../cross-exam-simulation.state';
import type { SimulationDebrief } from '../cross-exam-simulation.types';

const WORK_PRODUCT_DISCLAIMER =
  'These materials constitute attorney work product privileged under applicable law and are not subject to production in discovery. This simulation reflects one possible cross-examination strategy and does not guarantee what will occur at the actual deposition.';

const DEBRIEF_SYSTEM_PROMPT = `You are a deposition coach analyzing a completed cross-examination simulation. Based on the transcript of questions, answers, and scores, identify:

1. **Behavioral Patterns** (2-5): Recurring tendencies in the witness's answers (e.g., "habitual evasion on financial topics", "over-explains when confronted with documents", "volunteers damaging information unprompted").

2. **Coaching Recommendations** (3-5): Specific, actionable advice to improve the witness's deposition performance. Reference specific turns from the transcript.

Respond ONLY with valid JSON:
{
  "patterns": ["pattern1", ...],
  "coachingRecommendations": ["recommendation1", ...]
}`;

export function createDebriefGeneratorNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function debriefGeneratorNode(
    state: CrossExamSimulationState,
  ): Promise<Partial<CrossExamSimulationState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Generating deposition coaching debrief...',
      { step: 'debrief_generator', progress: 85 },
    );

    const { questions, answers, scores } = state;

    // Assemble transcript
    const transcript = questions.map((q) => {
      const a = answers.find((ans) => ans.turn === q.turn);
      const score = scores.find((s) => s.turn === q.turn);
      return {
        question: q,
        answer: a ?? { turn: q.turn, answer: '(no answer)', submittedAt: '' },
        score: score ?? {
          turn: q.turn,
          evasion: 0,
          consistency: 0,
          damage: 0,
          coachingNote: '',
        },
      };
    });

    // Select top 5 weakest moments by damage score
    const weakestMoments = [...scores]
      .sort((a, b) => b.damage - a.damage)
      .slice(0, 5);

    // Build transcript summary for LLM analysis
    const transcriptSummary = transcript
      .map(
        (t) =>
          `Turn ${t.question.turn} [evasion:${t.score.evasion}/consistency:${t.score.consistency}/damage:${t.score.damage}]\nQ: ${t.question.question}\nA: ${t.answer.answer}\nCoach: ${t.score.coachingNote}`,
      )
      .join('\n\n');

    const response = await callLLMMaybeWithReasoning(llmClient, {
      context: ctx,
      systemMessage: DEBRIEF_SYSTEM_PROMPT,
      userMessage: `SIMULATION TRANSCRIPT:\n${transcriptSummary}`,
      temperature: 0.3,
      maxTokens: 2000,
      callerName: 'cross-exam-simulation:debrief-generator',
    });

    let analysis: { patterns: string[]; coachingRecommendations: string[] };
    try {
      analysis = JSON.parse(
        stripMarkdownFences(response.text),
      ) as typeof analysis;
    } catch {
      return {
        error: `Failed to parse debrief analysis as JSON: ${response.text.slice(0, 200)}`,
        status: 'failed',
      };
    }

    const debrief: SimulationDebrief = {
      transcript,
      weakestMoments,
      patterns: analysis.patterns,
      coachingRecommendations: analysis.coachingRecommendations,
      disclaimerText: WORK_PRODUCT_DISCLAIMER,
    };

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Debrief complete: ${transcript.length} turns analyzed, ${weakestMoments.length} critical moments identified`,
      { step: 'debrief_complete', progress: 95 },
    );

    return { debrief, status: 'completed', completedAt: Date.now() };
  };
}
