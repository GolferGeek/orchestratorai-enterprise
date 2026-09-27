import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { RunModelScope } from '../../shared/models';
import type { WorkflowRunProgress } from '../../shared/runs';
import type { DecisionRiskState } from '../decision-risk.state';

/** What a node needs to call models: the run's capsule, model profile and any restart instruction. */
export function scopeOf(state: DecisionRiskState): RunModelScope {
  return {
    executionContext: state.executionContext,
    modelProfile: state.modelProfile,
    instruction: state.runInstruction,
  };
}

/**
 * Report progress through the workflow runtime: it records the step on the
 * run and emits the event. Nodes only run under the runtime, which supplies
 * `configurable.reportProgress`.
 */
export async function reportProgress(
  config: LangGraphRunnableConfig,
  step: string,
  progress: number,
  message: string,
): Promise<void> {
  const report = config.configurable?.reportProgress as
    | ((progress: WorkflowRunProgress) => Promise<void>)
    | undefined;
  if (!report) {
    throw new Error('decision-risk runs only under the workflow runtime (configurable.reportProgress is missing)');
  }
  await report({ step, progress, message });
}

/** The proposition and its context as the agents receive them. */
export function propositionInput(state: DecisionRiskState): { proposition: string; context: string | null } {
  const context = state.background?.trim();
  return { proposition: state.proposition.trim(), context: context ? context : null };
}
