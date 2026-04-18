import type { DocumentsAgentState } from '../documents-agent.state';
import type { ClassificationResult } from '../documents-agent.types';
import type { LLMHttpClientService } from '../../../../../shared/services/llm-http-client.service';
import type { ObservabilityService } from '../../../../../shared/services/observability.service';
import type { MatterRepository } from '../../../../matter/matter.repository';
import { callLLMMaybeWithReasoning } from '../../../../../shared/services/llm-maybe-reasoning.helper';

const VALID_CLASSES = new Set([
  'contract',
  'deposition',
  'court_filing',
  'correspondence',
  'evidence',
  'other',
]);

function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function buildSystemPrompt(): string {
  return `You are a legal document classification specialist. Analyze the provided legal document and return a JSON object.

CRITICAL: Return ONLY a valid JSON object. No explanation, no markdown, no preamble.

The object must have exactly these fields:
- "documentClass": one of: contract, deposition, court_filing, correspondence, evidence, other
- "documentDate": the primary date of the document as "YYYY-MM-DD" if present, otherwise null
- "summary": a 2-3 sentence summary of the document's purpose and key content (string)

Be precise about document class. Court filings include complaints, motions, orders, and judgments. Correspondence includes emails, letters, and memos.`;
}

function buildUserMessage(documentContent: string): string {
  const maxLen = 8000;
  const truncated =
    documentContent.length > maxLen
      ? documentContent.slice(0, maxLen) + '\n[... document truncated ...]'
      : documentContent;
  return `DOCUMENT:\n${truncated}\n\nClassify this document and return the JSON object.`;
}

export function createClassifyDocumentNode(
  llmClient: LLMHttpClientService,
  observability: ObservabilityService,
  matterRepo: MatterRepository,
) {
  return async function classifyDocumentNode(
    state: DocumentsAgentState,
  ): Promise<Partial<DocumentsAgentState>> {
    const ctx = state.executionContext;

    await observability.emitProgress(
      ctx,
      ctx.conversationId,
      'Documents Agent: classifying document',
      { step: 'docs_classify', progress: 30 },
    );

    try {
      const response = await callLLMMaybeWithReasoning(llmClient, {
        context: ctx,
        systemMessage: buildSystemPrompt(),
        userMessage: buildUserMessage(state.documentContent),
        callerName: 'legal-department:docs-classify',
        temperature: 0.1,
        maxTokens: 1000,
      });

      let classification: ClassificationResult;
      try {
        classification = JSON.parse(
          stripFences(response.text),
        ) as ClassificationResult;
        if (!classification.documentClass)
          throw new Error('Missing documentClass field');
      } catch (parseErr) {
        const retryResponse = await callLLMMaybeWithReasoning(llmClient, {
          context: ctx,
          systemMessage:
            buildSystemPrompt() +
            '\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY the JSON object.',
          userMessage: buildUserMessage(state.documentContent),
          callerName: 'legal-department:docs-classify-retry',
          temperature: 0.0,
          maxTokens: 1000,
        });
        classification = JSON.parse(
          stripFences(retryResponse.text),
        ) as ClassificationResult;
        if (!classification.documentClass)
          throw new Error(`Classification parse failed: ${String(parseErr)}`);
      }

      const documentClass = VALID_CLASSES.has(classification.documentClass)
        ? classification.documentClass
        : 'other';

      await matterRepo.updateDocumentClassification({
        documentId: state.documentId,
        matterId: state.matterId,
        documentClass,
        documentDate: classification.documentDate ?? null,
        summary: classification.summary ?? null,
        parties: [],
        keyTerms: [],
        metadata: {},
      });

      return {
        documentClass,
        documentDate: classification.documentDate ?? null,
        summary: classification.summary ?? null,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await observability.emitFailed(ctx, ctx.conversationId, msg);
      return { status: 'failed', error: msg };
    }
  };
}
