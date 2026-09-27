import { WORKFLOW_INVOKE_ACTIONS, type CapabilityCard, type WellKnownEntry } from '@orchestrator-ai/transport-types';
import type { CatalogWorkflow } from './workflow.registry';

/** Where a workflow is invoked (relative to the API base). */
function endpointOf(workflow: CatalogWorkflow): string {
  return workflow.entryPoint.kind === 'rest' ? workflow.entryPoint.endpoint : '/workflows/invoke';
}

/**
 * A workflow's A2A capability card, from its registry entry. Runtime
 * workflows are invoked with `context.agentSlug = slug` and `agentType =
 * 'workflow'`; `data.content` is `{action: 'start', input}` (or a review,
 * answer, cancel or restart on an existing run), and `start` answers at once
 * with `{runId, status}` - the run is followed on its stream.
 */
export function workflowCard(workflow: CatalogWorkflow): CapabilityCard {
  const runtime = workflow.entryPoint.kind === 'runtime' ? workflow.entryPoint : null;
  return {
    id: `workflow:${workflow.slug}`,
    slug: workflow.slug,
    name: workflow.name,
    description: workflow.description,
    kind: 'workflow',
    discoverable: true,
    invoke: { method: 'invoke', inputTypes: ['application/json'], outputTypes: ['json'], streaming: runtime !== null },
    outputTypes: ['json'],
    metadata: {
      endpoint: endpointOf(workflow),
      transport: 'json-rpc-2.0',
      context: { agentSlug: workflow.slug, agentType: 'workflow' },
      entryPoint: workflow.entryPoint.kind,
      hitl: workflow.hitl,
      dataClassification: workflow.dataClassification,
      organizationSlugs: workflow.organizationSlugs,
      ...(runtime
        ? {
            actions: [...WORKFLOW_INVOKE_ACTIONS],
            modelRoles: runtime.modelRoles,
            restartPoints: Object.keys(runtime.restartPoints),
            brief: `/workflows/${workflow.slug}/brief`,
          }
        : {}),
    },
  };
}

export function workflowListingEntry(workflow: CatalogWorkflow): WellKnownEntry {
  const card = workflowCard(workflow);
  return { slug: card.slug, name: card.name, description: card.description, kind: card.kind, streaming: card.invoke.streaming, outputTypes: card.outputTypes };
}
