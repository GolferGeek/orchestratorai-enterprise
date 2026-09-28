import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { reportProgress } from '../../shared/runs';
import type { SwarmStoreService } from '../swarm-store.service';
import { briefText } from '../swarm.input';
import type { SwarmState } from '../swarm.state';

/** What the org has configured, as chosen in the input; later admin edits do not change this run. */
export function createLoadNode(deps: { store: SwarmStoreService }) {
  return async (state: SwarmState, config: LangGraphRunnableConfig): Promise<Partial<SwarmState>> => {
    const input = state.input;
    if (!input) throw new Error('The swarm run has no input. This is a bug.');
    await reportProgress(config, 'load', 5, 'Loading writers, editors and evaluators');
    const loaded = await deps.store.runConfig(state.executionContext.orgSlug, input);
    return {
      config: { ...loaded, brief: briefText(input.brief, loaded.contentType), evidence: input.evidence ?? 'none' },
      drafts: loaded.writers.map((w) => ({ writer: w.slug, status: 'writing', error: null, versions: [] })),
    };
  };
}
