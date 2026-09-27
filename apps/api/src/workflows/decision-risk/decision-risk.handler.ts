import { Command } from '@langchain/langgraph';
import type { JsonValue } from '@orchestrator-ai/transport-types';
import { WorkflowInputError } from '../catalog/workflow.registry';
import type { ReviewResumeAction } from '../shared/reviews';
import type { WorkflowRunHandler } from '../shared/runs';
import type { DecisionRiskGraph } from './decision-risk.graph';
import type { DecisionRiskState } from './decision-risk.state';

export const DECISION_RISK_SLUG = 'decision-risk';
export const DECISION_RISK_MODEL_ROLES = ['analyst', 'red_team', 'writer'];

const MAX_PROPOSITION = 4000;
const MAX_BACKGROUND = 20000;

export interface DecisionRiskStartInput {
  proposition: string;
  background: string;
}

/** `start` input: { proposition, background? }, nothing else. */
export function parseDecisionRiskInput(input: JsonValue): DecisionRiskStartInput {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new WorkflowInputError('input must be an object with a proposition');
  }
  const extra = Object.keys(input).filter((key) => key !== 'proposition' && key !== 'background');
  if (extra.length > 0) throw new WorkflowInputError(`input has unknown fields: ${extra.join(', ')}`);
  const { proposition, background } = input;
  if (typeof proposition !== 'string' || proposition.trim() === '') {
    throw new WorkflowInputError('input.proposition is required');
  }
  if (proposition.length > MAX_PROPOSITION) {
    throw new WorkflowInputError(`input.proposition must be at most ${MAX_PROPOSITION} characters`);
  }
  if (background !== undefined && typeof background !== 'string') {
    throw new WorkflowInputError('input.background must be text');
  }
  if (typeof background === 'string' && background.length > MAX_BACKGROUND) {
    throw new WorkflowInputError(`input.background must be at most ${MAX_BACKGROUND} characters`);
  }
  return { proposition: proposition.trim(), background: typeof background === 'string' ? background.trim() : '' };
}

export function decisionRiskRunTitle(input: JsonValue): string {
  const { proposition } = parseDecisionRiskInput(input);
  const single = proposition.replace(/\s+/g, ' ');
  return single.length <= 90 ? single : `${single.slice(0, 89)}…`;
}

/** The run result the UI renders (runs.result). */
export function decisionRiskResult(state: DecisionRiskState): JsonValue {
  if (state.overallScore === null || !state.executiveSummary) {
    throw new Error('Decision risk finished without a score or summary. This is a bug, not an empty result.');
  }
  return {
    subjectId: state.subjectId,
    overallScore: state.overallScore,
    overallConfidence: state.overallConfidence,
    residualScore: state.residualScore,
    executiveSummary: state.executiveSummary,
    dimensions: state.assessments.map((a) => ({
      slug: a.dimensionSlug,
      name: state.dimensions.find((d) => d.slug === a.dimensionSlug)?.name ?? a.dimensionSlug,
      score: a.score,
      confidence: a.confidence,
      reasoning: a.reasoning,
      evidence: a.evidence,
    })),
    debate: state.debate
      ? {
          originalScore: state.debate.originalScore,
          finalScore: state.debate.finalScore,
          adjustment: state.debate.adjustment,
        }
      : null,
    mitigations: state.mitigations.map((m) => ({
      dimensionSlug: m.dimensionSlug,
      proposal: m.proposal,
      rationale: m.rationale,
      effort: m.effort,
      residualScore: m.residualScore,
    })),
    monteCarlo: state.monteCarlo as unknown as JsonValue,
  };
}

/**
 * Runs a decision-risk run on the worker: a fresh run starts the graph; a
 * run requeued by a review resumes it with the response; a run retried after
 * a failure continues from its last checkpoint. The thread id is the run id.
 */
export function createDecisionRiskHandler(graph: DecisionRiskGraph): WorkflowRunHandler {
  return {
    slug: DECISION_RISK_SLUG,
    run: async ({ run, reportProgress }) => {
      const config = { configurable: { thread_id: run.id, reportProgress } };
      const resume = run.pendingAction as ReviewResumeAction | null;
      if (resume) {
        await graph.invoke(new Command({ resume: resume.response }), config);
      } else if ((await graph.getState(config)).next.length > 0) {
        await graph.invoke(null, config);
      } else {
        const input = parseDecisionRiskInput(run.input);
        await graph.invoke(
          {
            executionContext: run.executionContext,
            modelProfile: run.modelProfile,
            proposition: input.proposition,
            background: input.background,
          },
          config,
        );
      }
      const snapshot = await graph.getState(config);
      if (snapshot.next.length > 0) return { kind: 'awaiting_review' };
      return { kind: 'completed', result: decisionRiskResult(snapshot.values as DecisionRiskState) };
    },
  };
}
