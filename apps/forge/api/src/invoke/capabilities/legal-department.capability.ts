/**
 * Legal Department Capability Adapter
 *
 * Wraps LegalDepartmentService as a CapabilityHandler so the invoke
 * infrastructure can route requests to the legal department LangGraph workflow.
 *
 * Document processing pipeline:
 * 1. Receive documents as base64 in invoke data
 * 2. Extract text from PDFs using pdf-parse
 * 3. Extract legal metadata via LegalIntelligenceService (single LLM call)
 * 4. Pass extracted text + metadata to the LangGraph workflow
 * 5. CLO routing uses metadata to engage specialist agents
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type {
  ExecutionContext,
  InvokeData,
  InvokeOutput,
  CapabilityCard,
} from '@orchestrator-ai/transport-types';
import type { CapabilityHandler } from '../capability-registry.service';
import { CapabilityRegistryService } from '../capability-registry.service';
import { LegalDepartmentService } from '@/agents/legal-department/legal-department.service';
import { LegalIntelligenceService } from '@/agents/legal-department/services/legal-intelligence.service';
import { ObservabilityService } from '@/agents/shared/services/observability.service';
import type { LegalDocumentMetadata } from '@/agents/legal-department/legal-department.state';

@Injectable()
export class LegalDepartmentCapability
  implements CapabilityHandler, OnModuleInit
{
  private readonly logger = new Logger(LegalDepartmentCapability.name);

  constructor(
    private readonly registry: CapabilityRegistryService,
    private readonly legalDepartmentService: LegalDepartmentService,
    private readonly legalIntelligence: LegalIntelligenceService,
    private readonly observability: ObservabilityService,
  ) {}

  onModuleInit(): void {
    this.registry.register('legal-department', this);
    this.logger.log(
      'LegalDepartmentCapability registered with capability registry',
    );
  }

  async invoke(
    context: ExecutionContext,
    data: InvokeData,
    _metadata?: Record<string, unknown>,
  ): Promise<InvokeOutput> {
    const content = data.content as Record<string, unknown> | null | undefined;

    const userMessage = (content?.userMessage as string) || '';
    if (!userMessage) {
      throw new Error(
        'data.content.userMessage is required for legal department invocation',
      );
    }

    // Process documents: extract text from PDFs and generate legal metadata
    const rawDocuments = content?.documents as
      | Array<{ name: string; content: string; type?: string }>
      | undefined;

    let processedDocuments:
      | Array<{ name: string; content: string; type?: string }>
      | undefined;

    if (rawDocuments && rawDocuments.length > 0) {
      processedDocuments = [];

      void this.observability.emitProgress(
        context,
        context.conversationId,
        `Processing ${rawDocuments.length} document(s)...`,
        { step: 'document_processing', progress: 5 },
      );

      for (const doc of rawDocuments) {
        void this.observability.emitProgress(
          context,
          context.conversationId,
          `Extracting text from: ${doc.name}`,
          { step: 'document_text_extraction', progress: 8 },
        );

        const extractedText = await this.extractDocumentText(doc);
        processedDocuments.push({
          name: doc.name,
          content: extractedText,
          type: doc.type,
        });
      }
    }

    // Phase 3: Extract metadata for all documents in parallel.
    const docsForProcess = processedDocuments || rawDocuments || [];
    let documentsMetadata: LegalDocumentMetadata[] = [];
    if (docsForProcess.length > 0) {
      void this.observability.emitProgress(
        context,
        context.conversationId,
        `Analyzing legal metadata for ${docsForProcess.length} document(s)...`,
        { step: 'metadata_extraction_llm', progress: 10 },
      );

      try {
        documentsMetadata = await this.legalIntelligence.extractMetadataForAll(
          context,
          docsForProcess,
        );
        void this.observability.emitProgress(
          context,
          context.conversationId,
          `Metadata extracted: ${documentsMetadata.map((m) => m.documentType.type).join(', ')}`,
          { step: 'metadata_extraction_complete', progress: 15 },
        );
      } catch (metaErr) {
        this.logger.warn(
          `Metadata extraction failed (continuing without): ${metaErr instanceof Error ? metaErr.message : String(metaErr)}`,
        );
      }
    }

    void this.observability.emitProgress(
      context,
      context.conversationId,
      'Starting LangGraph workflow...',
      { step: 'workflow_start', progress: 18 },
    );

    const result = await this.legalDepartmentService.process({
      context,
      userMessage,
      documents: docsForProcess,
      documentsMetadata,
    });

    return {
      outputType: 'json',
      content: {
        conversationId: context.conversationId,
        status: result.status,
        userMessage: result.userMessage,
        response: result.response,
        specialistOutputs: result.specialistOutputs,
        documentsMetadata: result.documentsMetadata,
        routingDecision: result.routingDecision,
        error: result.error,
      },
      metadata: {
        duration: result.duration,
      },
    };
  }

  /**
   * Extract readable text from a document.
   * Handles PDF (via pdf-parse), plain text, and base64-encoded content.
   */
  private async extractDocumentText(doc: {
    name: string;
    content: string;
    type?: string;
  }): Promise<string> {
    const isPdf =
      doc.type?.includes('pdf') || doc.name.toLowerCase().endsWith('.pdf');

    // Check if content is base64-encoded
    const isBase64 = /^[A-Za-z0-9+/=\s]{100,}$/.test(
      doc.content.substring(0, 200),
    );

    if (isPdf && isBase64) {
      return this.extractPdfText(doc.content, doc.name);
    }

    if (isBase64) {
      return Buffer.from(doc.content, 'base64').toString('utf-8');
    }

    // Already plain text
    return doc.content;
  }

  /**
   * Extract text from a base64-encoded PDF using pdf-parse.
   */
  private async extractPdfText(
    base64Content: string,
    filename: string,
  ): Promise<string> {
    const pdfParseModule = await import('pdf-parse') as unknown as {
      default: (buf: Buffer) => Promise<{ text: string; numpages: number }>;
    };
    const pdfParse = pdfParseModule.default;
    const buffer = Buffer.from(base64Content, 'base64');
    const result = await pdfParse(buffer);

    this.logger.log(
      `PDF extracted: ${filename} — ${result.numpages} pages, ${result.text.length} chars`,
    );

    return result.text;
  }

  getCard(): CapabilityCard {
    return {
      id: 'forge-legal-department',
      slug: 'legal-department',
      name: 'Legal Department',
      description:
        'Multi-specialist legal workflow — contract analysis, compliance, IP, privacy, and more',
      kind: 'workflow',
      discoverable: true,
      invoke: {
        method: 'invoke',
        inputTypes: ['text', 'json'],
        outputTypes: ['json'],
        streaming: false,
      },
      outputTypes: ['json'],
      metadata: {
        product: 'forge',
        agentType: 'langgraph',
      },
    };
  }
}
