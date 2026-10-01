/**
 * Every workflow graph compiles. LangGraph rejects a graph at compile time
 * (for example a node named like a state channel), which happens when the
 * module initialises - so a graph that does not compile takes the whole API
 * down on deploy. This catches it first.
 */
import { MemorySaver } from '@langchain/langgraph';
import { createCompetitorWatchGraph } from './competitor-watch/competitor-watch.graph';
import { createDecisionRiskGraph } from './decision-risk/decision-risk.graph';
import { createExecDigestGraph } from './exec-digest/exec-digest.graph';
import { createPostmortemGraph } from './incident-postmortem/postmortem.graph';
import { createOnboardingGraph } from './onboarding-plan/onboarding.graph';
import { createSwarmGraph } from './marketing-swarm/swarm.graph';
import { createInvoiceReviewGraph } from './invoice-review/invoice-review.graph';
import { createSubmittalReviewGraph } from './submittal-review/submittal-review.graph';

const any = {} as never;

describe('workflow graphs', () => {
  it.each([
    ['decision-risk', () => createDecisionRiskGraph({ units: any, store: any, ledger: any, checkpointer: new MemorySaver() })],
    ['exec-digest', () => createExecDigestGraph({ units: any, store: any, checkpointer: new MemorySaver() })],
    ['competitor-watch', () => createCompetitorWatchGraph({ units: any, store: any, fetcher: any, checkpointer: new MemorySaver() })],
    ['invoice-review', () => createInvoiceReviewGraph({ units: any, store: any, documents: any, ledger: any, partners: any, checkpointer: new MemorySaver() })],
    ['submittal-review', () => createSubmittalReviewGraph({ units: any, specs: any, documents: any, ledger: any, decisions: any, checkpointer: new MemorySaver() })],
    ['incident-postmortem', () => createPostmortemGraph({ units: any, tasks: any, webUrl: 'https://x', checkpointer: new MemorySaver() })],
    ['marketing-swarm', () => createSwarmGraph({ units: any, store: any, checkpointer: new MemorySaver() })],
    ['onboarding-plan', () => createOnboardingGraph({ units: any, hires: any, policy: any, runTasks: any, webUrl: 'https://x', checkpointer: new MemorySaver() })],
  ])('%s compiles', (_slug, build) => {
    expect(build).not.toThrow();
  });
});
