import type { OrgActivity } from './activity-store.service';

/** Company totals: arithmetic, not a model's reading. */
export function companyTotals(activity: OrgActivity[]) {
  const sum = (pick: (a: OrgActivity) => number) => activity.reduce((total, a) => total + pick(a), 0);
  const byStatus: Record<string, number> = {};
  for (const a of activity) {
    for (const statuses of Object.values(a.workflowRuns)) {
      for (const [status, n] of Object.entries(statuses)) byStatus[status] = (byStatus[status] ?? 0) + n;
    }
  }
  return {
    departments: activity.length,
    workflowRuns: sum((a) => a.workflowRunsTotal),
    workflowRunsByStatus: byStatus,
    agentConversations: sum((a) => a.agentConversationsTotal),
    openReviews: sum((a) => a.openReviews),
    modelCalls: sum((a) => a.modelCalls),
    modelCostUsd: Math.round(sum((a) => a.modelCostUsd) * 10000) / 10000,
  };
}
