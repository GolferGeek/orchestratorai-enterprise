/**
 * Deal Memo — Conditions Precedent Section Node.
 *
 * Fourth of five section-draft nodes. Emphasizes missingDocuments and
 * dealBreakerFlags via the section prompt (see shared/section-prompts.ts).
 * See shared/section-node.factory.ts for the shared implementation.
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { createSectionDraftNode } from './shared/section-node.factory';

export function createSectionConditionsPrecedentNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return createSectionDraftNode(
    'conditions-precedent',
    llmClient,
    observability,
    { progressOnStart: 56 },
  );
}
