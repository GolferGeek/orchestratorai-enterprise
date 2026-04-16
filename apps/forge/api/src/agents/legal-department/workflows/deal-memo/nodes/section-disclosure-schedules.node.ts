/**
 * Deal Memo — Disclosure Schedules Section Node.
 *
 * Third of five section-draft nodes. See shared/section-node.factory.ts
 * for the shared implementation.
 */
import type { LLMHttpClientService } from '../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../shared/services/observability.service';
import { createSectionDraftNode } from './shared/section-node.factory';

export function createSectionDisclosureSchedulesNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
) {
  return createSectionDraftNode(
    'disclosure-schedules',
    llmClient,
    observability,
    { progressOnStart: 44 },
  );
}
