import { Injectable } from '@nestjs/common';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { StateSnapshot } from '@langchain/langgraph';
import { IssueLedgerService } from '../ledger';
import type { WorkflowRunRecord } from '../runs';

/** The part of a compiled LangGraph graph a fork uses. */
export interface ForkableGraph {
  getStateHistory(config: RunnableConfig): AsyncIterableIterator<StateSnapshot>;
  getState(config: RunnableConfig): Promise<StateSnapshot>;
  updateState(config: RunnableConfig, values: Record<string, unknown>, asNode?: string): Promise<RunnableConfig>;
}

/** The parent run's history has no usable branch point (a 'failed' run, not a retry). */
export class RestartForkError extends Error {}

/**
 * Starts a restarted run: its LangGraph thread is forked from the parent's
 * checkpoint history at the branch point, and its issue ledger is copied as
 * it stood there. The branch starts from the parent's state at that moment,
 * not from the parent's final result.
 */
@Injectable()
export class WorkflowRestartService {
  constructor(private readonly ledger: IssueLedgerService) {}

  /**
   * Fork `run` (a queued restart with an empty thread) from its parent.
   * `values` replaces what must belong to the new run in the copied state:
   * its ExecutionContext, model profile and restart instruction.
   */
  async fork(graph: ForkableGraph, run: WorkflowRunRecord, values: Record<string, unknown>): Promise<void> {
    const restart = run.restart;
    if (!restart) throw new Error(`Run ${run.id} is not a restart`);
    const { parentRunId, resumeAt } = restart;

    // Newest first. The boundary is the checkpoint written when the node
    // before `resumeAt` finished, so its predecessor's `next` names that node.
    const history: StateSnapshot[] = [];
    for await (const snapshot of graph.getStateHistory({ configurable: { thread_id: parentRunId } })) {
      history.push(snapshot);
    }
    const index = history.findIndex(
      (snapshot, i) =>
        isOnly(snapshot.next, resumeAt) &&
        history[i + 1] !== undefined &&
        history[i + 1]!.next.length === 1 &&
        history[i + 1]!.next[0] !== resumeAt,
    );
    if (index < 0) {
      throw new RestartForkError(`Run ${parentRunId} has no checkpoint before "${resumeAt}" to branch from`);
    }
    const boundary = history[index]!;
    const asNode = history[index + 1]!.next[0]!;
    if (!boundary.createdAt) throw new RestartForkError(`The checkpoint before "${resumeAt}" has no time`);

    const scope = { executionContext: run.executionContext, modelProfile: run.modelProfile };
    await this.ledger.copyAsOf(parentRunId, scope, new Date(boundary.createdAt), `restart:${parentRunId}`);

    const config = { configurable: { thread_id: run.id } };
    await graph.updateState(config, { ...(boundary.values as Record<string, unknown>), ...values }, asNode);
    const forked = await graph.getState(config);
    if (!isOnly(forked.next, resumeAt)) {
      throw new RestartForkError(
        `The fork of run ${parentRunId} would run [${forked.next.join(', ')}] next, not "${resumeAt}"`,
      );
    }
  }
}

function isOnly(next: readonly string[], node: string): boolean {
  return next.length === 1 && next[0] === node;
}
