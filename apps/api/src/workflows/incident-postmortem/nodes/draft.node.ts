import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { reportProgress, scopeOf } from '../../shared/runs';
import type { WorkUnitService } from '../../shared/work-units';
import type { ActionItem, Postmortem, PostmortemState } from '../postmortem.state';

type ProposedItem = Omit<ActionItem, 'key' | 'task'>;

/** The blameless draft (a writer), then the action items that follow from it (an analyst). */
export function createDraftNode(deps: { units: WorkUnitService }) {
  return async (state: PostmortemState, config: LangGraphRunnableConfig): Promise<Partial<PostmortemState>> => {
    const scope = scopeOf(state);
    await reportProgress(config, 'draft', 30, 'Writing the postmortem');
    const postmortem = await deps.units.runSolo<Postmortem>(scope, {
      slug: 'draft-postmortem',
      agent: 'postmortem-writer',
      input: { title: state.title, severity: state.severity!.level, incident: state.incident },
    });
    await reportProgress(config, 'actions', 60, 'Proposing action items');
    const { items } = await deps.units.runSolo<{ items: ProposedItem[] }>(scope, {
      slug: 'propose-action-items',
      agent: 'postmortem-action-items',
      input: { title: state.title, rootCause: postmortem.rootCause, contributingFactors: postmortem.contributingFactors, lessons: postmortem.lessons },
    });
    return { postmortem, actionItems: items.map((item, i) => ({ ...item, key: `action-${i + 1}`, task: null })) };
  };
}
