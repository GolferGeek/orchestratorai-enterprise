import type { FactsAgentState } from '../facts-agent.state';
import type { ExtractedEntity } from '../facts-agent.types';
import type { LLMHttpClientService } from '../../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../../shared/services/observability.service';
import type { MatterRepository } from '../../../../matter/matter.repository';
import { callLLMMaybeWithReasoning } from '../../../../../shared/services/llm-maybe-reasoning.helper';

const VALID_ENTITY_TYPES = new Set([
  'person',
  'organization',
  'location',
  'date',
  'amount',
  'contract',
  'claim',
  'exhibit',
  'other',
]);

function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function buildSystemPrompt(): string {
  return `You are a legal facts extraction specialist. Your task is to extract named entities from legal documents and return them as a JSON array.

CRITICAL: You MUST return ONLY a valid JSON array. No explanation, no markdown, no preamble.

Each entity object must have exactly these fields:
- "entityType": one of: person, organization, location, date, amount, contract, claim, exhibit, other
- "name": the entity's name as it appears in the document (string)
- "description": a 1-2 sentence description of this entity's relevance (string or null)
- "role": the entity's role in the matter, e.g. "plaintiff", "expert witness", "counterparty" (string or null)

Extract only entities that are clearly relevant to the legal matter. Do not hallucinate.`;
}

function buildUserMessage(
  documentContent: string,
  priorKnowledgeSummary: string,
): string {
  const priorSection = priorKnowledgeSummary
    ? `\n\nPREVIOUSLY KNOWN ENTITIES (from earlier documents in this matter):\n${priorKnowledgeSummary}\n\nExtract NEW entities from the current document. Update existing ones if you find new information.`
    : '';

  const maxDocLength = 8000;
  const truncated =
    documentContent.length > maxDocLength
      ? documentContent.slice(0, maxDocLength) +
        '\n[... document truncated ...]'
      : documentContent;

  return `CURRENT DOCUMENT:\n${truncated}${priorSection}\n\nReturn a JSON array of entities extracted from the CURRENT DOCUMENT.`;
}

export function createExtractEntitiesNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  matterRepo: MatterRepository,
) {
  return async function extractEntitiesNode(
    state: FactsAgentState,
  ): Promise<Partial<FactsAgentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Facts Agent: extracting named entities from document',
      { step: 'facts_extract_entities', progress: 30 },
    );

    try {
      const response = await callLLMMaybeWithReasoning(llmClient, {
        context: ctx,
        systemMessage: buildSystemPrompt(),
        userMessage: buildUserMessage(
          state.documentContent,
          state.priorKnowledgeSummary,
        ),
        callerName: 'legal-department:facts-extract-entities',
        temperature: 0.1,
        maxTokens: 4000,
      });

      let entities: ExtractedEntity[];
      try {
        entities = JSON.parse(stripFences(response.text)) as ExtractedEntity[];
        if (!Array.isArray(entities))
          throw new Error('Response is not an array');
      } catch (parseErr) {
        // Retry once with explicit schema reminder
        const retryResponse = await callLLMMaybeWithReasoning(llmClient, {
          context: ctx,
          systemMessage:
            buildSystemPrompt() +
            '\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY a JSON array, nothing else.',
          userMessage: buildUserMessage(
            state.documentContent,
            state.priorKnowledgeSummary,
          ),
          callerName: 'legal-department:facts-extract-entities-retry',
          temperature: 0.0,
          maxTokens: 4000,
        });
        entities = JSON.parse(
          stripFences(retryResponse.text),
        ) as ExtractedEntity[];
        if (!Array.isArray(entities))
          throw new Error(`Parse retry failed: ${String(parseErr)}`);
      }

      // Filter invalid entity types
      const valid = entities.filter((e) =>
        VALID_ENTITY_TYPES.has(e.entityType),
      );

      // Upsert each entity to the DB
      for (const entity of valid) {
        await matterRepo.upsertEntity({
          matterId: state.matterId,
          orgSlug: ctx.orgSlug,
          entityType: entity.entityType,
          name: entity.name,
          description: entity.description,
          role: entity.role,
          sourceDocumentId: state.documentId,
        });
      }

      return { entities: valid };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await observability.emitFailed(ctx, ctx.conversationId, msg);
      return { status: 'failed', error: msg };
    }
  };
}
