/**
 * Context Family Runner
 *
 * Handles agents of family type 'context':
 * - Single LLM call with a markdown system prompt
 * - Conversation-aware (appends to conversation history in data.content)
 * - Returns text/markdown InvokeOutput
 * - Supports multimodal attachments:
 *     Images (PNG, JPG, WEBP, GIF) — passed to LLM as vision input
 *     Documents (PDF, DOCX, TXT/MD) — text extracted and prepended to user message
 *
 * No LangGraph, no mode routing, no deliverables — just LLM + system prompt.
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import type {
  ExecutionContext,
  InvokeData,
  InvokeOutput,
} from '@orchestrator-ai/transport-types';
import { LLM_SERVICE, LLMServiceProvider } from '@orchestratorai/planes/llm';
import type { FamilyRunner } from '../invoke-dispatch.service';
import type { AgentDefinition } from '../agent-definition.types';
import type { LLMResponse } from '@orchestratorai/planes/llm';
import { PdfExtractorService, DocxExtractorService, TextExtractorService } from '@orchestratorai/planes/extractors';

/**
 * An attachment as received in invoke data.content.attachments.
 * base64 is the raw base64-encoded file content (no data-URL prefix).
 */
interface InvokeAttachment {
  base64: string;
  mimeType: string;
  filename: string;
}

@Injectable()
export class ContextFamilyRunner implements FamilyRunner {
  private readonly logger = new Logger(ContextFamilyRunner.name);

  constructor(
    @Inject(LLM_SERVICE) private readonly llmService: LLMServiceProvider,
    private readonly pdfExtractor: PdfExtractorService,
    private readonly docxExtractor: DocxExtractorService,
    private readonly textExtractor: TextExtractorService,
  ) {}

  async invoke(
    definition: AgentDefinition,
    context: ExecutionContext,
    data: InvokeData,
  ): Promise<InvokeOutput> {
    this.logger.debug(
      `ContextFamilyRunner.invoke — agent: ${definition.slug}, org: ${context.orgSlug}`,
    );

    const systemPrompt = this.buildSystemPrompt(definition);
    const userMessage = this.extractUserMessage(data);
    const attachments = this.extractAttachments(data);

    const provider = definition.llmConfig?.provider ?? context.provider;
    const model = definition.llmConfig?.model ?? context.model;

    // Partition attachments into images and documents
    const imageAttachments = attachments.filter((a) =>
      a.mimeType.startsWith('image/'),
    );
    const documentAttachments = attachments.filter(
      (a) => !a.mimeType.startsWith('image/'),
    );

    // Extract text from document attachments and prepend to user message
    const finalUserMessage = await this.buildUserMessageWithDocuments(
      userMessage,
      documentAttachments,
    );

    let llmResponse: string | LLMResponse;

    if (imageAttachments.length > 0) {
      // Vision call — use generateResponse which supports options.images
      llmResponse = await this.llmService.generateResponse(
        systemPrompt,
        finalUserMessage,
        {
          provider,
          model,
          temperature: definition.llmConfig?.temperature,
          maxTokens: definition.llmConfig?.maxTokens,
          conversationId: context.conversationId,
          userId: context.userId,
          organizationSlug: context.orgSlug,
          agentSlug: definition.slug,
          callerType: 'agent' as const,
          callerName: `${definition.slug}-context`,
          executionContext: context,
          images: imageAttachments.map((a) => ({
            base64: a.base64,
            mimeType: a.mimeType,
          })),
        },
      );
    } else {
      // Text-only call — use generateUnifiedResponse
      llmResponse = await this.llmService.generateUnifiedResponse({
        provider,
        model,
        systemPrompt,
        userMessage: finalUserMessage,
        options: {
          temperature: definition.llmConfig?.temperature,
          maxTokens: definition.llmConfig?.maxTokens,
          conversationId: context.conversationId,
          userId: context.userId,
          organizationSlug: context.orgSlug,
          agentSlug: definition.slug,
          callerType: 'agent' as const,
          callerName: `${definition.slug}-context`,
          executionContext: context,
        },
      });
    }

    const content = this.extractContent(llmResponse);
    const llmMeta = this.extractMeta(llmResponse);

    return {
      content,
      outputType: definition.outputType ?? 'text',
      metadata: {
        agentSlug: definition.slug,
        provider,
        model,
        attachmentCount: attachments.length,
        imageCount: imageAttachments.length,
        documentCount: documentAttachments.length,
        ...llmMeta,
      },
    };
  }

  private buildSystemPrompt(definition: AgentDefinition): string {
    if (definition.context && definition.context.trim().length > 0) {
      return definition.context.trim();
    }
    return `You are ${definition.name ?? definition.slug}, a helpful AI assistant.`;
  }

  private extractUserMessage(data: InvokeData): string {
    if (typeof data.content === 'string') {
      return data.content;
    }
    if (data.content && typeof data.content === 'object') {
      const obj = data.content as Record<string, unknown>;
      const msg = obj.message ?? obj.userMessage ?? obj.text ?? obj.content;
      if (typeof msg === 'string') {
        return msg;
      }
      return JSON.stringify(data.content);
    }
    return '';
  }

  /**
   * Extract attachments from invoke data.
   * Supports data.content as { message: string, attachments: InvokeAttachment[] }.
   * Returns empty array when data.content is a plain string or has no attachments.
   */
  private extractAttachments(data: InvokeData): InvokeAttachment[] {
    if (data.content && typeof data.content === 'object') {
      const obj = data.content as Record<string, unknown>;
      if (Array.isArray(obj.attachments)) {
        return obj.attachments as InvokeAttachment[];
      }
    }
    return [];
  }

  /**
   * Extract text from each document attachment and prepend to the user message.
   * Format: "[Document: filename]\n<extracted text>\n\n---\n\nUser: <original message>"
   * Throws if extraction fails — no silent fallbacks.
   */
  private async buildUserMessageWithDocuments(
    userMessage: string,
    documents: InvokeAttachment[],
  ): Promise<string> {
    if (documents.length === 0) {
      return userMessage;
    }

    const extractedSections: string[] = [];

    for (const doc of documents) {
      const buffer = Buffer.from(doc.base64, 'base64');
      const extractedText = await this.extractDocumentText(
        buffer,
        doc.mimeType,
        doc.filename,
      );
      extractedSections.push(`[Document: ${doc.filename}]\n${extractedText}`);
    }

    const documentContext = extractedSections.join('\n\n---\n\n');
    return `${documentContext}\n\n---\n\nUser: ${userMessage}`;
  }

  /**
   * Dispatch to the correct extractor based on MIME type.
   * Throws on unsupported types — no silent fallbacks.
   */
  private async extractDocumentText(
    buffer: Buffer,
    mimeType: string,
    filename: string,
  ): Promise<string> {
    const lower = mimeType.toLowerCase();

    if (lower === 'application/pdf') {
      return this.pdfExtractor.extractText(buffer);
    }

    if (
      lower ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lower === 'application/msword'
    ) {
      return this.docxExtractor.extractText(buffer);
    }

    if (
      lower === 'text/plain' ||
      lower === 'text/markdown' ||
      lower === 'text/csv'
    ) {
      return this.textExtractor.extractText(buffer);
    }

    throw new Error(
      `Unsupported document MIME type for text extraction: ${mimeType} (file: ${filename}). ` +
        `Supported types: application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, ` +
        `text/plain, text/markdown, text/csv`,
    );
  }

  private extractContent(response: string | LLMResponse): string {
    if (typeof response === 'string') {
      return response;
    }
    if (response && typeof response === 'object') {
      const r = response;
      if (typeof r.content === 'string') {
        return r.content;
      }
    }
    return '';
  }

  private extractMeta(response: string | LLMResponse): Record<string, unknown> {
    if (typeof response === 'string') {
      return {};
    }
    if (response && typeof response === 'object') {
      const r = response;
      return (r.metadata as unknown as Record<string, unknown>) ?? {};
    }
    return {};
  }
}
