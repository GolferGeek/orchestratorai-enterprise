/**
 * The one per-workflow frontend constant: which registered workflows have a
 * page in this app, and the route that hosts it.
 *
 * A workflow the API registers but that has no entry here has no UI yet. The
 * nav shows it as such instead of routing it somewhere else.
 */
const WORKFLOW_ROUTE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  'marketing-swarm': 'MarketingSwarm',
});

export function workflowRouteName(slug: string): string | null {
  return WORKFLOW_ROUTE_NAMES[slug] ?? null;
}
