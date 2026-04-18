import type { FactsAgentState } from '../facts-agent.state';
import type { ExtractedTimelineEntry } from '../facts-agent.types';
import type { LLMHttpClientService } from '../../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../../shared/services/observability.service';
import type { MatterRepository } from '../../../../matter/matter.repository';
import { callLLMMaybeWithReasoning } from '../../../../../shared/services/llm-maybe-reasoning.helper';

const VALID_EVENT_TYPES = new Set([
  'filing',
  'deposition',
  'hearing',
  'communication',
  'transaction',
  'discovery',
  'other',
]);
const VALID_SIGNIFICANCE = new Set(['critical', 'high', 'medium', 'low']);

function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function buildSystemPrompt(): string {
  return `You are a legal timeline extraction specialist. Extract chronological events from legal documents and return a JSON array.

CRITICAL: Return ONLY a valid JSON array. No markdown, no explanation.

Each event object must have exactly these fields:
- "eventDateRaw": the date as it appears in the document (string, required)
- "eventDate": ISO date string "YYYY-MM-DD" if parseable, otherwise null
- "eventType": one of: filing, deposition, hearing, communication, transaction, discovery, other
- "description": clear description of what happened (string, required)
- "significance": one of: critical, high, medium, low (or null if unclear)
- "partiesInvolved": array of party names mentioned in connection with this event (string[])

Only extract events with clear dates or temporal references. Do not fabricate events.`;
}

function buildUserMessage(documentContent: string): string {
  const maxLen = 8000;
  const truncated =
    documentContent.length > maxLen
      ? documentContent.slice(0, maxLen) + '\n[... truncated ...]'
      : documentContent;
  return `DOCUMENT:\n${truncated}\n\nExtract all chronological events. Return a JSON array (may be empty []).`;
}

export function createExtractTimelineNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  matterRepo: MatterRepository,
) {
  return async function extractTimelineNode(
    state: FactsAgentState,
  ): Promise<Partial<FactsAgentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Facts Agent: extracting timeline events from document',
      { step: 'facts_extract_timeline', progress: 55 },
    );

    try {
      const response = await callLLMMaybeWithReasoning(llmClient, {
        context: ctx,
        systemMessage: buildSystemPrompt(),
        userMessage: buildUserMessage(state.documentContent),
        callerName: 'legal-department:facts-extract-timeline',
        temperature: 0.1,
        maxTokens: 3000,
      });

      let entries: ExtractedTimelineEntry[];
      try {
        entries = JSON.parse(
          stripFences(response.text),
        ) as ExtractedTimelineEntry[];
        if (!Array.isArray(entries)) throw new Error('Not an array');
      } catch (parseErr) {
        const retryResponse = await callLLMMaybeWithReasoning(llmClient, {
          context: ctx,
          systemMessage:
            buildSystemPrompt() +
            '\n\nReturn ONLY a JSON array. If no events, return [].',
          userMessage: buildUserMessage(state.documentContent),
          callerName: 'legal-department:facts-extract-timeline-retry',
          temperature: 0.0,
          maxTokens: 3000,
        });
        entries = JSON.parse(
          stripFences(retryResponse.text),
        ) as ExtractedTimelineEntry[];
        if (!Array.isArray(entries))
          throw new Error(`Parse retry failed: ${String(parseErr)}`);
      }

      // Validate and insert each entry
      const valid = entries.filter(
        (e) =>
          typeof e.description === 'string' &&
          e.description.trim().length > 0 &&
          VALID_EVENT_TYPES.has(e.eventType),
      );

      for (const entry of valid) {
        await matterRepo.insertTimelineEntry({
          matterId: state.matterId,
          orgSlug: ctx.orgSlug,
          eventDateRaw: entry.eventDateRaw,
          eventDate: entry.eventDate,
          eventType: VALID_EVENT_TYPES.has(entry.eventType)
            ? entry.eventType
            : 'other',
          description: entry.description,
          significance: VALID_SIGNIFICANCE.has(entry.significance ?? '')
            ? entry.significance
            : null,
          partiesInvolved: Array.isArray(entry.partiesInvolved)
            ? entry.partiesInvolved
            : [],
          sourceDocumentId: state.documentId,
        });
      }

      return { timelineEntries: valid };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await observability.emitFailed(ctx, ctx.conversationId, msg);
      return { status: 'failed', error: msg };
    }
  };
}
