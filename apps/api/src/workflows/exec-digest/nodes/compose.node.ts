import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { reportProgress, scopeOf } from '../../shared/runs';
import type { WorkUnitService } from '../../shared/work-units';
import type { ExecDigestState } from '../exec-digest.state';
import { companyTotals } from '../exec-digest.totals';

/** The company view on top of the department summaries. */
export function createComposeNode(deps: { units: WorkUnitService }) {
  return async (state: ExecDigestState, config: LangGraphRunnableConfig): Promise<Partial<ExecDigestState>> => {
    await reportProgress(config, 'compose', 80, 'Writing the company summary');
    const companySummary = await deps.units.runSolo<string>(scopeOf(state), {
      slug: 'compose-digest',
      agent: 'exec-digest-composer',
      input: { weekEnding: state.weekEnding!, totals: companyTotals(state.activity), departments: state.summaries },
    });
    return { companySummary: companySummary.trim() };
  };
}
