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
import {
  PdfExtractorService,
  DocxExtractorService,
  TextExtractorService,
} from '@orchestratorai/planes/extractors';

/**
 * An attachment as received in invoke data.content.attachments.
 * base64 is the raw base64-encoded file content (no data-URL prefix).
 */
interface InvokeAttachment {
  base64: string;
  mimeType: string;
  filename: string;
}

const MAX_ATTACHMENT_COUNT = 4;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 40 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4;
const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
  'text/csv',
]);

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

    const provider = context.provider;
    const model = context.model;

    // Partition attachments into images and documents
    const imageAttachments = attachments.filter((a) =>
      IMAGE_MIME_TYPES.has(a.mimeType),
    );
    const documentAttachments = attachments.filter(
      (a) => DOCUMENT_MIME_TYPES.has(a.mimeType),
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
          includeMetadata: true,
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
          includeMetadata: true,
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
    throw new Error(`Context agent ${definition.slug} is missing its system prompt`);
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
        return this.validateAttachments(obj.attachments);
      }
    }
    return [];
  }

  private validateAttachments(attachments: unknown[]): InvokeAttachment[] {
    if (attachments.length > MAX_ATTACHMENT_COUNT) {
      throw new Error(`Maximum ${MAX_ATTACHMENT_COUNT} attachments are allowed`);
    }

    let totalBytes = 0;
    return attachments.map((attachment, index) => {
      if (typeof attachment !== 'object' || attachment === null) {
        throw new Error(`Attachment ${index} must be an object`);
      }
      const record = attachment as Record<string, unknown>;
      if (
        !this.hasOnlyKeys(record, ['base64', 'mimeType', 'filename']) ||
        typeof record.base64 !== 'string' ||
        typeof record.mimeType !== 'string' ||
        typeof record.filename !== 'string'
      ) {
        throw new Error(`Attachment ${index} has an invalid shape`);
      }

      if (
        record.filename.length === 0 ||
        record.filename.length > 255 ||
        /[\x00-\x1f\x7f/\\]/.test(record.filename)
      ) {
        throw new Error(`Attachment ${index} has an invalid filename`);
      }
      if (
        !IMAGE_MIME_TYPES.has(record.mimeType) &&
        !DOCUMENT_MIME_TYPES.has(record.mimeType)
      ) {
        throw new Error(
          `Unsupported attachment MIME type: ${record.mimeType}`,
        );
      }
      if (
        record.base64.length === 0 ||
        record.base64.length > MAX_BASE64_LENGTH ||
        record.base64.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(record.base64)
      ) {
        throw new Error(`Attachment ${index} must contain valid base64`);
      }

      const decoded = Buffer.from(record.base64, 'base64');
      if (
        decoded.length === 0 ||
        decoded.length > MAX_ATTACHMENT_BYTES ||
        decoded.toString('base64') !== record.base64
      ) {
        throw new Error(`Attachment ${index} must contain valid base64`);
      }
      totalBytes += decoded.length;
      if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
        throw new Error('Total attachment size exceeds 40 MB');
      }

      return {
        base64: record.base64,
        mimeType: record.mimeType,
        filename: record.filename,
      };
    });
  }

  private hasOnlyKeys(
    value: Record<string, unknown>,
    allowedKeys: readonly string[],
  ): boolean {
    const allowed = new Set(allowedKeys);
    return Object.keys(value).every((key) => allowed.has(key));
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
    throw new Error('LLM returned an invalid response without content');
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
