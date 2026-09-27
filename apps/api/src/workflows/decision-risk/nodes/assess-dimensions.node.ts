import type { Logger } from '@nestjs/common';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { WorkUnitService } from '../../shared/work-units';
import type { RiskStoreService } from '../risk-store.service';
import type {
  DecisionRiskState,
  DimensionAssessment,
} from '../decision-risk.state';
import { propositionInput, reportProgress, scopeOf } from './run-context';

/** The dimension assessor's output (its agent contract enforces it). */
interface DimensionVerdict {
  score: number;
  confidence: number;
  reasoning: string;
  evidence: string[];
}

/** At most this many dimension assessors call their model at once. */
export const DIMENSION_CONCURRENCY = 5;

/**
 * The risk radar: every dimension assesses the proposition independently, as
 * one panel work unit, each assessor framed by its dimension's prompt from
 * the risk schema.
 *
 * Independence is the point: the dimensions do not see each other's
 * verdicts, so they cannot converge on a shared narrative, which is what
 * makes the spread between them informative and gives the red team something
 * real to attack. The panel is fail_all: a composite computed from a subset,
 * presented as complete, is a wrong answer that looks like a right one.
 */
export function createAssessDimensionsNode(deps: {
  units: WorkUnitService;
  store: RiskStoreService;
  logger: Logger;
}) {
  return async (
    state: DecisionRiskState,
    config: LangGraphRunnableConfig,
  ): Promise<Partial<DecisionRiskState>> => {
    const { dimensions, scope, subjectId, executionContext } = state;
    if (!scope || !subjectId) {
      throw new Error('assess_dimensions ran without a scope or subject. load_scope must run first.');
    }

    await reportProgress(
      config,
      'assess_dimensions',
      15,
      `Running the risk radar across ${dimensions.length} dimensions`,
    );
    const input = propositionInput(state);
    const panel = await deps.units.runPanel<DimensionVerdict>(scopeOf(state), {
      slug: 'assess-dimensions',
      panelists: dimensions.map((dimension) => ({
        agent: 'risk-dimension-assessor',
        input,
        framing: dimension.systemPrompt,
        label: dimension.name,
      })),
      maxConcurrent: DIMENSION_CONCURRENCY,
      policy: { mode: 'fail_all' },
    });

    const assessments: DimensionAssessment[] = panel.results.map((result, index) => {
      const dimension = dimensions[index]!;
      if (!result.ok) {
        // fail_all rejects before this; a failed result here is a bug.
        throw new Error(`Dimension '${dimension.slug}' has no verdict: ${result.error}`);
      }
      return {
        dimensionId: dimension.id,
        dimensionSlug: dimension.slug,
        score: result.output.score,
        confidence: result.output.confidence,
        reasoning: result.output.reasoning.trim(),
        evidence: result.output.evidence,
      };
    });

    const persisted = await deps.store.recordAssessments(executionContext, subjectId, assessments, dimensions);
    deps.logger.log(`Assessed ${assessments.length} dimensions for subject ${subjectId}`);
    await reportProgress(config, 'assess_dimensions', 50, `All ${assessments.length} dimensions assessed`);
    return { assessments: persisted };
  };
}
