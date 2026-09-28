import { Annotation, Command, type LangGraphRunnableConfig } from '@langchain/langgraph';
import type { ExecutionContext, JsonValue } from '@orchestrator-ai/transport-types';
import type { RunModelProfile, RunModelScope } from '../models';
import type { ForkableGraph, WorkflowRestartService } from '../restarts';
import type { ReviewResumeAction } from '../reviews';
import type { WorkflowRunHandler } from './workflow-handler.registry';
import type { WorkflowRunProgress } from './workflow-runs.repository';
import type { WorkflowRunRecord } from './workflow-run.types';

/**
 * The channels every runtime graph carries: the run's capsule, its model
 * profile, and a restarted run's instruction. Spread into Annotation.Root.
 */
export const runtimeStateChannels = {
  /** The run's capsule, exactly as the frontend (or ambient) sent it. */
  executionContext: Annotation<ExecutionContext>(),
  /** Role -> model, snapshotted when the run started. */
  modelProfile: Annotation<RunModelProfile>(),
  /** A restarted run's instruction for its agents (never on the context). */
  runInstruction: Annotation<string | null>({ reducer: (_, next) => next, default: () => null }),
};

export interface RuntimeState {
  executionContext: ExecutionContext;
  modelProfile: RunModelProfile;
  runInstruction: string | null;
}

/** What a node passes to work units and the ledger. */
export function scopeOf(state: RuntimeState): RunModelScope {
  return { executionContext: state.executionContext, modelProfile: state.modelProfile, instruction: state.runInstruction };
}

/** Report a step through the runtime (it records it on the run and emits it). */
export async function reportProgress(
  config: LangGraphRunnableConfig,
  step: string,
  progress: number,
  message: string,
  /** Optional snapshot the page shows while the run is going (replaces the last). */
  live?: JsonValue,
): Promise<void> {
  const report = config.configurable?.reportProgress as ((p: WorkflowRunProgress) => Promise<void>) | undefined;
  if (!report) throw new Error('This graph runs only under the workflow runtime (configurable.reportProgress is missing)');
  await report({ step, progress, message, ...(live !== undefined ? { live } : {}) });
}

interface RunnableGraph extends ForkableGraph {
  invoke(input: unknown, config: LangGraphRunnableConfig): Promise<unknown>;
}

/**
 * The runtime handler for a LangGraph workflow: a fresh run starts the graph
 * with `start(run)`; a run requeued by a review resumes with the response; a
 * retried run continues from its last checkpoint; a restart forks from its
 * parent. The thread id is the run id. The result comes from the final state.
 */
export function createGraphHandler<TState extends RuntimeState>(options: {
  slug: string;
  graph: RunnableGraph;
  restarts: WorkflowRestartService;
  /** The initial state beyond the runtime channels, from the run's parsed input. */
  start(run: WorkflowRunRecord): Record<string, unknown>;
  /** The run result from the final state; throw if the state is incomplete. */
  result(state: TState): JsonValue;
}): WorkflowRunHandler {
  const { graph } = options;
  return {
    slug: options.slug,
    run: async ({ run, reportProgress: report }) => {
      const config = { configurable: { thread_id: run.id, reportProgress: report } };
      const resume = run.pendingAction as ReviewResumeAction | null;
      if (resume) {
        await graph.invoke(new Command({ resume: resume.response }), config);
      } else if ((await graph.getState(config)).next.length > 0) {
        await graph.invoke(null, config);
      } else if (run.restart) {
        await options.restarts.fork(graph, run, {
          executionContext: run.executionContext,
          modelProfile: run.modelProfile,
          runInstruction: run.restart.instruction,
        });
        await graph.invoke(null, config);
      } else {
        await graph.invoke(
          { executionContext: run.executionContext, modelProfile: run.modelProfile, ...options.start(run) },
          config,
        );
      }
      const snapshot = await graph.getState(config);
      if (snapshot.next.length > 0) return { kind: 'awaiting_review' };
      return { kind: 'completed', result: options.result(snapshot.values as TState) };
    },
  };
}
