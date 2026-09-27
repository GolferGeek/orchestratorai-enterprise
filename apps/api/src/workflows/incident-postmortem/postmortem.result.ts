import type { JsonValue } from '@orchestrator-ai/transport-types';
import type { ActionItem, Postmortem, PostmortemState, Severity } from './postmortem.state';

export interface PostmortemResult {
  title: string;
  severity: Severity;
  postmortem: Postmortem;
  actionItems: ActionItem[];
}

export function postmortemResult(state: PostmortemState): JsonValue {
  if (!state.severity || !state.postmortem) throw new Error('The postmortem finished without its severity or draft. This is a bug.');
  if (state.actionItems.some((i) => !i.task)) throw new Error('An approved action item has no task. This is a bug.');
  const result: PostmortemResult = { title: state.title, severity: state.severity.level, postmortem: state.postmortem, actionItems: state.actionItems };
  return result as unknown as JsonValue;
}
