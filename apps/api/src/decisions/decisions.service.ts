import { DecisionError, type DecisionClient } from './client';
import { runRubric, type Rubric, type RubricResult } from './rubric';

/**
 * Typed decisions (pass / review / block) from the decision model, in
 * process: the rubric's questions go to /v1/systemone in one request and its
 * routing rules turn the answers into a verdict. Workflow checks
 * (WorkUnitService.runCheck) and agent post-guards call this.
 */
export class DecisionsService {
  constructor(
    private readonly client: DecisionClient,
    private readonly rubrics: ReadonlyMap<string, Rubric>,
  ) {}

  /** The model checks run on (DECISION_MODEL). */
  get model(): string {
    return this.client.model;
  }

  /** Rubric names this API ships, sorted. */
  rubricNames(): string[] {
    return [...this.rubrics.keys()].sort();
  }

  /** Run a rubric on its declared inputs. */
  async check(rubric: string, inputs: Record<string, unknown>): Promise<RubricResult> {
    const found = this.rubrics.get(rubric);
    if (!found) throw new DecisionError(`Unknown rubric "${rubric}" (apps/api/src/decisions/rubrics has ${this.rubricNames().join(', ')})`);
    return runRubric(this.client, found, inputs);
  }
}
