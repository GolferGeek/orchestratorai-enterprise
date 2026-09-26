import { interrupt } from '@langchain/langgraph';
import type { ExecutionContext, JsonValue } from '@orchestrator-ai/transport-types';
import type { HumanReviewService } from './human-review.service';
import type { HumanGate, HumanReviewResponse } from './human-review.types';

/**
 * Stop the run at a human gate and return what the person sent.
 *
 * On first entry this opens the review (task + waiting event) and pauses the
 * graph; the worker parks the run as awaiting_review. When the response
 * arrives the run is requeued, LangGraph re-runs this node from the top, the
 * review for this round already exists (no duplicate), and interrupt()
 * returns the response.
 *
 * Rules for the node that calls it:
 * - Do no LLM or other paid work in the same node before this call; it would
 *   run again on resume. Produce the payload in an earlier node.
 * - `round` comes from graph state and changes each time the gate is reached
 *   again (after a rejection reruns earlier work); keep it in state and
 *   increment it when the node returns.
 */
export async function awaitHumanReview(
  reviews: HumanReviewService,
  context: ExecutionContext,
  gate: HumanGate,
  round: number,
  payload: JsonValue,
): Promise<HumanReviewResponse> {
  await reviews.requestReview(context, gate, round, payload);
  return interrupt<JsonValue, HumanReviewResponse>(payload);
}

/**
 * Where a graph goes after an approval gate: on, or the gate's declared
 * reject behavior. A response of the wrong kind is a bug, not a default.
 */
export function routeAfterDecision(
  gate: Extract<HumanGate, { kind: 'approval' }>,
  response: HumanReviewResponse,
): 'approved' | 'modified' | 'rerun_items' | 'rerun_stage' | 'fail' {
  if (response.kind !== 'decision') {
    throw new Error(`Gate "${gate.slug}" expected a decision, got ${response.kind}`);
  }
  switch (response.decision.type) {
    case 'approve':
      return 'approved';
    case 'modify':
      return 'modified';
    case 'reject':
      return gate.onReject;
  }
}
