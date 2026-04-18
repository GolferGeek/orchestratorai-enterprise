import type { DocumentsAgentState } from '../documents-agent.state';
import type { MetadataResult } from '../documents-agent.types';
import type { LLMHttpClientService } from '../../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../../shared/services/observability.service';
import type { MatterRepository } from '../../../../matter/matter.repository';
import { callLLMMaybeWithReasoning } from '../../../../../shared/services/llm-maybe-reasoning.helper';

function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function buildSystemPrompt(): string {
  return `You are a legal metadata extraction specialist. Extract structured metadata from legal documents and return a JSON object.

CRITICAL: Return ONLY a valid JSON object. No explanation, no markdown.

The object must have exactly these fields:
- "parties": array of full names of all parties mentioned in the document (string[])
- "keyTerms": array of key legal terms, defined terms, or important concepts (max 15, string[])
- "additionalMetadata": object with any other relevant metadata (e.g., case number, court, amount in controversy)

If a field has no relevant values, use an empty array or empty object.`;
}

function buildUserMessage(
  documentContent: string,
  documentClass: string | null,
): string {
  const maxLen = 8000;
  const truncated =
    documentContent.length > maxLen
      ? documentContent.slice(0, maxLen) + '\n[... document truncated ...]'
      : documentContent;
  const classHint = documentClass ? `\n\nDocument type: ${documentClass}` : '';
  return `DOCUMENT:${classHint}\n${truncated}\n\nExtract metadata and return the JSON object.`;
}

export function createExtractMetadataNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  matterRepo: MatterRepository,
) {
  return async function extractMetadataNode(
    state: DocumentsAgentState,
  ): Promise<Partial<DocumentsAgentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Documents Agent: extracting parties and key terms',
      { step: 'docs_extract_metadata', progress: 60 },
    );

    try {
      const response = await callLLMMaybeWithReasoning(llmClient, {
        context: ctx,
        systemMessage: buildSystemPrompt(),
        userMessage: buildUserMessage(
          state.documentContent,
          state.documentClass,
        ),
        callerName: 'legal-department:docs-extract-metadata',
        temperature: 0.1,
        maxTokens: 2000,
      });

      let metadata: MetadataResult;
      try {
        metadata = JSON.parse(stripFences(response.text)) as MetadataResult;
        if (!Array.isArray(metadata.parties))
          throw new Error('Missing parties array');
      } catch (parseErr) {
        const retryResponse = await callLLMMaybeWithReasoning(llmClient, {
          context: ctx,
          systemMessage:
            buildSystemPrompt() +
            '\n\nReturn ONLY the JSON object. No other text.',
          userMessage: buildUserMessage(
            state.documentContent,
            state.documentClass,
          ),
          callerName: 'legal-department:docs-extract-metadata-retry',
          temperature: 0.0,
          maxTokens: 2000,
        });
        metadata = JSON.parse(
          stripFences(retryResponse.text),
        ) as MetadataResult;
        if (!Array.isArray(metadata.parties))
          throw new Error(`Metadata parse failed: ${String(parseErr)}`);
      }

      const parties = Array.isArray(metadata.parties) ? metadata.parties : [];
      const keyTerms = Array.isArray(metadata.keyTerms)
        ? metadata.keyTerms.slice(0, 15)
        : [];
      const additionalMetadata =
        metadata.additionalMetadata &&
        typeof metadata.additionalMetadata === 'object'
          ? metadata.additionalMetadata
          : {};

      await matterRepo.updateDocumentClassification({
        documentId: state.documentId,
        matterId: state.matterId,
        documentClass: state.documentClass,
        documentDate: state.documentDate,
        summary: state.summary,
        parties,
        keyTerms,
        metadata: additionalMetadata,
      });

      return { parties, keyTerms, additionalMetadata };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await observability.emitFailed(ctx, ctx.conversationId, msg);
      return { status: 'failed', error: msg };
    }
  };
}
