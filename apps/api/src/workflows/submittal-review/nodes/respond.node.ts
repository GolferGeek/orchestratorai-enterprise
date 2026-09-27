import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { reportProgress, scopeOf } from '../../shared/runs';
import type { WorkUnitService } from '../../shared/work-units';
import { ACTION_LABELS } from '../findings';
import type { SubmittalDecisionsService } from '../submittal-decisions.service';
import type { SubmittalReviewState } from '../submittal-review.state';

/** The response letter (a writer, told the action), and the decision recorded. */
export function createRespondNode(deps: { units: WorkUnitService; decisions: SubmittalDecisionsService }) {
  return async (state: SubmittalReviewState, config: LangGraphRunnableConfig): Promise<Partial<SubmittalReviewState>> => {
    const action = state.action!;
    await reportProgress(config, 'respond', 90, `Writing the response: ${ACTION_LABELS[action]}`);
    const letter = await deps.units.runSolo<string>(scopeOf(state), {
      slug: 'write-response',
      agent: 'submittal-response-writer',
      input: {
        section: state.specSection,
        action: ACTION_LABELS[action],
        findings: state.findings.map((f) => ({ ref: f.ref, requirement: f.requirement, status: f.status, note: f.note })),
      },
    });
    const context = state.executionContext;
    await deps.decisions.record(context.orgSlug, context.conversationId, state.specSection, action, state.findings);
    return { letter: letter.trim() };
  };
}
