/**
 * Next Move Decider Node — a pure logic node (no LLM call) that decides
 * whether the simulation should continue or enter the debrief phase, and
 * selects the next move type and topic for the question generator.
 */
import type { CrossExamSimulationState } from '../cross-exam-simulation.state';
import type { SimulationMove } from '../cross-exam-simulation.types';

export function createNextMoveDeciderNode() {
  return function nextMoveDeciderNode(
    state: CrossExamSimulationState,
  ): Partial<CrossExamSimulationState> {
    const {
      currentTurn,
      input,
      simulationStrategy,
      scores,
      documentsConfronted,
    } = state;

    // Check termination conditions
    const topicsExhausted = state.topicsExhausted;
    const allTopics = simulationStrategy?.topics ?? [];
    const shouldEnd =
      currentTurn >= input.maxQuestions ||
      topicsExhausted.length >= allTopics.length;

    if (shouldEnd) {
      return { sessionPhase: 'debrief', currentTurn: currentTurn + 1 };
    }

    // Decide next move based on recent scores and available documents
    const lastScore = scores[scores.length - 1];
    const availableDocs = Object.keys(
      simulationStrategy?.documentConfrontationMap ?? {},
    ).filter((d) => !documentsConfronted.includes(d));

    let nextMove: SimulationMove;
    let nextTopic = state.currentTopic;

    if (lastScore && lastScore.evasion >= 7) {
      // Witness was evasive — follow up hard
      nextMove = 'follow-up';
    } else if (lastScore && lastScore.consistency >= 6) {
      // Inconsistency detected — impeach
      nextMove = 'impeach';
    } else if (availableDocs.length > 0 && currentTurn % 3 === 0) {
      // Introduce a document confrontation every ~3 turns if docs available
      nextMove = 'confront-document';
    } else {
      // Move to a new topic
      nextMove = 'new-topic';
      const nextTopicCandidate = allTopics.find(
        (t) => !topicsExhausted.includes(t) && t !== state.currentTopic,
      );
      if (nextTopicCandidate) {
        nextTopic = nextTopicCandidate;
      }
    }

    // If we moved to a new topic, mark the current one as exhausted
    const updatedTopicsExhausted =
      nextMove === 'new-topic' && state.currentTopic
        ? [...topicsExhausted, state.currentTopic]
        : topicsExhausted;

    return {
      currentTurn: currentTurn + 1,
      currentTopic: nextTopic,
      topicsExhausted: updatedTopicsExhausted,
    };
  };
}
