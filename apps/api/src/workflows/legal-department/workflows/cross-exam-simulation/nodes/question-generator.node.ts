/**
 * Question Generator Node — opposing counsel agent generates the next
 * cross-examination question, then calls interrupt() to pause the graph
 * and surface the question to the frontend. On resume (after answer
 * submission), the node returns without further action so the answer
 * scorer can process the submitted answer.
 */
import { interrupt } from '@langchain/langgraph';
import { AIMessage } from '@langchain/core/messages';
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { callLLMMaybeWithReasoning } from '../../../../shared/services/llm-maybe-reasoning.helper';
import { stripMarkdownFences } from '../../../nodes/specialist-utils';
import type { CrossExamSimulationState } from '../cross-exam-simulation.state';
import type {
  SimulationAnswer,
  SimulationQuestion,
} from '../cross-exam-simulation.types';

const QUESTION_GENERATOR_SYSTEM_PROMPT = `You are an aggressive opposing counsel in a deposition. Your job is to generate the next cross-examination question for the current topic.

Use the prior Q&A context to:
- Follow up on evasive or incomplete answers
- Introduce document confrontations when appropriate
- Probe inconsistencies with prior statements
- Vary your approach: don't ask the same type of question twice in a row

Generate ONE precise cross-examination question that advances your strategy.

Respond ONLY with valid JSON:
{
  "question": "Your exact question text",
  "topic": "The topic this question addresses",
  "move": "follow-up" | "new-topic" | "confront-document" | "impeach"
}`;

const SLIDING_WINDOW_SIZE = 10; // max Q&A pairs; messages slice uses * 2 (one AIMessage per Q, one per A)

export function createQuestionGeneratorNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return async function questionGeneratorNode(
    state: CrossExamSimulationState,
  ): Promise<Partial<CrossExamSimulationState>> {
    const ctx = state.executionContext;
    const turn = state.currentTurn;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      `Opposing counsel generating question for turn ${turn}...`,
      { step: 'question_generator', progress: 30 + turn * 5 },
    );

    // Build sliding-window context from prior Q&A
    const priorPairs = state.questions.slice(-SLIDING_WINDOW_SIZE).map((q) => {
      const a = state.answers.find((ans) => ans.turn === q.turn);
      return `Q${q.turn}: ${q.question}\nA${q.turn}: ${a?.answer ?? '(no answer yet)'}`;
    });

    const strategyContext = state.simulationStrategy
      ? `STRATEGY:\n- Topics: ${state.simulationStrategy.topics.join(', ')}\n- Vulnerabilities: ${state.simulationStrategy.witnessVulnerabilities.join('; ')}`
      : '';

    const userMessage = `${strategyContext}

CURRENT TOPIC: ${state.currentTopic ?? state.simulationStrategy?.topics[0] ?? 'General'}
TURN: ${turn} of ${state.input.maxQuestions}
DOCUMENTS NOT YET CONFRONTED: ${
      Object.keys(state.simulationStrategy?.documentConfrontationMap ?? {})
        .filter((d) => !state.documentsConfronted.includes(d))
        .join(', ') || 'none'
    }

PRIOR Q&A (last ${SLIDING_WINDOW_SIZE} exchanges):
${priorPairs.length > 0 ? priorPairs.join('\n\n') : '(first question — no prior context)'}`;

    const response = await callLLMMaybeWithReasoning(llmClient, {
      context: ctx,
      systemMessage: QUESTION_GENERATOR_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.7,
      maxTokens: 1500,
      callerName: 'cross-exam-simulation:question-generator',
    });

    let parsed: {
      question: string;
      topic: string;
      move: SimulationQuestion['move'];
    };
    try {
      parsed = JSON.parse(stripMarkdownFences(response.text)) as typeof parsed;
    } catch {
      return {
        error: `Failed to parse question response as JSON: ${response.text}`,
        status: 'failed',
      };
    }

    const simulationQuestion: SimulationQuestion = {
      turn,
      question: parsed.question,
      topic: parsed.topic,
      move: parsed.move,
    };

    // Append question to sliding-window messages
    const updatedMessages = [
      ...state.messages,
      new AIMessage(`Q${turn}: ${parsed.question}`),
    ].slice(-SLIDING_WINDOW_SIZE * 2);

    // interrupt() pauses the graph and surfaces the question payload to the
    // frontend. On resume, interrupt() returns the submitted answer entry
    // (SimulationAnswer). We capture it here and add it to state.answers so
    // the answer_scorer can access it on the same resumed run.
    const resumedAnswer = interrupt<
      SimulationQuestion,
      SimulationAnswer | undefined
    >({
      turn,
      question: parsed.question,
      topic: parsed.topic,
      move: parsed.move,
    });

    const updatedAnswers = resumedAnswer?.answer
      ? [...state.answers, resumedAnswer]
      : state.answers;

    return {
      questions: [...state.questions, simulationQuestion],
      answers: updatedAnswers,
      messages: updatedMessages,
    };
  };
}
