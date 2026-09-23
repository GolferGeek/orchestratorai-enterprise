import { Annotation } from '@langchain/langgraph';
import { HitlBaseStateAnnotation } from '../shared/hitl/hitl-base.state';

/**
 * A dimension plus the prompt that drives its assessment.
 *
 * Both come from the database (`risk.dimensions` joined to the active
 * `risk.dimension_contexts` row). Nothing about which dimensions exist, how
 * they are weighted, or what they ask is compiled in — adding a dimension is an
 * INSERT.
 */
export interface RiskDimension {
  id: string;
  slug: string;
  name: string;
  /** Proportion of the composite. Active weights sum to 1.0 within a scope. */
  weight: number;
  contextId: string;
  systemPrompt: string;
}

/** One dimension's verdict on the proposition. */
export interface DimensionAssessment {
  dimensionId: string;
  dimensionSlug: string;
  /** 0 = no meaningful risk, 100 = reason enough not to proceed. */
  score: number;
  /** 0-1. Low confidence on thin information is a valid, useful answer. */
  confidence: number;
  reasoning: string;
  evidence: string[];
  /** Assigned once persisted; mitigations reference it. */
  assessmentId?: string;
}

export interface DebateOutcome {
  debateId: string;
  originalScore: number;
  finalScore: number;
  adjustment: number;
  blue: unknown;
  red: unknown;
  arbiter: unknown;
}

export interface Mitigation {
  assessmentId: string;
  dimensionSlug: string;
  proposal: string;
  rationale: string;
  effort: 'low' | 'medium' | 'high';
  /** What the dimension would score if this were done. */
  residualScore: number;
}

export interface DecisionRiskScope {
  id: string;
  name: string;
  organizationSlug: string;
  thresholds: { flagged: number; debate: number; alert: number };
  analysisConfig: Record<string, unknown>;
}

/**
 * State for the decision-risk graph.
 *
 * Extends HitlBaseStateAnnotation, which carries the ExecutionContext capsule
 * whole — every node reads orgSlug, userId, provider and model from there and
 * none of them reconstructs it.
 */
export const DecisionRiskStateAnnotation = Annotation.Root({
  ...HitlBaseStateAnnotation.spec,

  /** What the organisation is considering doing. The input. */
  proposition: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  /** Free-text background supplied with the proposition. May be empty. */
  background: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  scope: Annotation<DecisionRiskScope | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  /** The row in risk.subjects representing this proposition. */
  subjectId: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  dimensions: Annotation<RiskDimension[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // Appends rather than replaces: the assess node fans out and each dimension
  // contributes independently.
  assessments: Annotation<DimensionAssessment[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  compositeScoreId: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  overallScore: Annotation<number | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  /** Weighted mean of the dimension confidences. */
  overallConfidence: Annotation<number | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  debate: Annotation<DebateOutcome | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  mitigations: Annotation<Mitigation[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  /** Composite score assuming every proposed mitigation is carried out. */
  residualScore: Annotation<number | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  executiveSummary: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});

export type DecisionRiskState = typeof DecisionRiskStateAnnotation.State;
