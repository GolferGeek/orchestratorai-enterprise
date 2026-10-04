import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { noulOf } from '../../../decisions';
import { reportProgress, scopeOf } from '../../shared/runs';
import type { WorkUnitService } from '../../shared/work-units';
import type { PostmortemState, Severity } from '../postmortem.state';

const LEVELS: Record<'block' | 'review' | 'pass', Severity> = { block: 'SEV1', review: 'SEV2', pass: 'SEV3' };

/** Jev's incident-severity rubric sets the severity: the same scale for every postmortem. */
export function createSeverityNode(deps: { units: WorkUnitService }) {
  return async (state: PostmortemState, config: LangGraphRunnableConfig): Promise<Partial<PostmortemState>> => {
    await reportProgress(config, 'severity', 10, 'Rating the severity');
    const [verdict] = await deps.units.runCheck(scopeOf(state), {
      slug: 'rate-severity',
      checks: [{ rubric: 'incident-severity', inputs: { incident: `${state.title}\n\n${state.incident}`.slice(0, 6000) } }],
    });
    return { severity: { level: LEVELS[verdict!.decision], dataAffected: noulOf(verdict!, 'data_affected') } };
  };
}
