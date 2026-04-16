/**
 * Deal Memo — Covenants Section Node.
 *
 * Fifth of five section-draft nodes. See shared/section-node.factory.ts
 * for the shared implementation.
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { createSectionDraftNode } from './shared/section-node.factory';

export function createSectionCovenantsNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return createSectionDraftNode('covenants', llmClient, observability, {
    progressOnStart: 68,
  });
}
