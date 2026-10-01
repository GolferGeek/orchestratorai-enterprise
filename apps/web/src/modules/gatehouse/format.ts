/** Small formatting helpers shared by the Gatehouse pages. */

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** What an A2A agent's target does, in a few words. */
export function describeTarget(target: import('./types').A2ATarget): string {
  switch (target.kind) {
    case 'ambient':
      return `Raises the ambient event ${target.event}`;
    case 'agent':
      return `Calls the agent ${target.agentSlug}`;
    case 'workflow':
      return `Starts the workflow ${target.workflowSlug}`;
    case 'a2a':
      return `Forwards to ${target.cardUrl}`;
  }
}

/** The page a workflow run opens on. */
export function runLink(workflowSlug: string, runId: string): string {
  return `/app/workflows/${workflowSlug}?conversationId=${encodeURIComponent(runId)}`;
}

/** A message from anything thrown, for an error banner. */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
