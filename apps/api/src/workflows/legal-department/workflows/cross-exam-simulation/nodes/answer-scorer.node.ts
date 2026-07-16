/**
 * Answer Scorer Node — evaluates the witness's answer against the question,
 * prior statements, and simulation strategy to produce a TurnScore with
 * evasion/consistency/damage scores (0-10) and a coaching note.
 */
import { HumanMessage } from '@langchain/core/messages';
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';
import type { CrossExamSimulationState } from '../cross-exam-simulation.state';
import type { TurnScore } from '../cross-exam-simulation.types';

const ANSWER_SCORER_SYSTEM_PROMPT = `You are a deposition coach evaluating how a witness answered a cross-examination question. Score the answer on three dimensions (0-10 each, higher = more harmful to the witness):

- **evasion** (0=fully responsive, 10=completely non-responsive): Did the witness avoid answering?
- **consistency** (0=fully consistent, 10=directly contradicts prior statements): Did the answer contradict prior statements or case facts?
- **damage** (0=no damage, 10=extremely damaging admission): How much did this answer help opposing counsel's case?

Also provide a one-sentence **coachingNote** explaining the most important thing to improve.

Respond ONLY with valid JSON:
{
  "evasion": 0-10,
  "consistency": 0-10,
  "damage": 0-10,
  "coachingNote": "..."
}`;

export function createAnswerScorerNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function answerScorerNode(
    state: CrossExamSimulationState,
  ): Promise<Partial<CrossExamSimulationState>> {
    const ctx = state.executionContext;
    const turn = state.currentTurn;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Scoring answer for turn ${turn}...`,
      { step: 'answer_scorer', progress: 40 + turn * 5 },
    );

    // Find the question and answer for the current turn
    const question = state.questions.find((q) => q.turn === turn);
    const answer = state.answers.find((a) => a.turn === turn);

    if (!question || !answer) {
      return {
        error: `Missing question or answer for turn ${turn}`,
        status: 'failed',
      };
    }

    const userMessage = `QUESTION (Turn ${turn}): ${question.question}
WITNESS ANSWER: ${answer.answer}
${state.input.priorStatements ? `\nPRIOR STATEMENTS:\n${state.input.priorStatements}` : ''}
${state.simulationStrategy?.witnessVulnerabilities ? `\nKNOWN VULNERABILITIES:\n${state.simulationStrategy.witnessVulnerabilities.join('; ')}` : ''}`;

    const response = await callLLMMaybeWithReasoning(llmClient, {
      context: ctx,
      systemMessage: ANSWER_SCORER_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.1,
      maxTokens: 1500,
      callerName: 'cross-exam-simulation:answer-scorer',
    });

    let scored: {
      evasion: number;
      consistency: number;
      damage: number;
      coachingNote: string;
    };
    try {
      scored = JSON.parse(stripMarkdownFences(response.text)) as typeof scored;
    } catch {
      return {
        error: `Failed to parse answer score response as JSON: ${response.text.slice(0, 200)}`,
        status: 'failed',
      };
    }

    const turnScore: TurnScore = {
      turn,
      evasion: Math.min(10, Math.max(0, scored.evasion)),
      consistency: Math.min(10, Math.max(0, scored.consistency)),
      damage: Math.min(10, Math.max(0, scored.damage)),
      coachingNote: scored.coachingNote,
    };

    // Append answer to sliding-window messages
    const updatedMessages = [
      ...state.messages,
      new HumanMessage(`A${turn}: ${answer.answer}`),
    ].slice(-20); // 10 Q&A pairs × 2 messages each

    return {
      scores: [...state.scores, turnScore],
      messages: updatedMessages,
    };
  };
}
