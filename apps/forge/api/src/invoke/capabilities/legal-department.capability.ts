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
    let legalMetadata: LegalDocumentMetadata | undefined =
      content?.legalMetadata as LegalDocumentMetadata | undefined;

    if (rawDocuments && rawDocuments.length > 0) {
      processedDocuments = [];

      for (const doc of rawDocuments) {
        const extractedText = await this.extractDocumentText(doc);
        processedDocuments.push({
          name: doc.name,
          content: extractedText,
          type: doc.type,
        });

        // Extract legal metadata from the first document (primary document)
        if (!legalMetadata && extractedText.length > 50) {
          this.logger.log(
            `Extracting legal metadata from: ${doc.name} (${extractedText.length} chars)`,
          );
          legalMetadata = await this.legalIntelligence.extractMetadata(
            context,
            extractedText,
            doc.name,
          );
          this.logger.log(
            `Legal metadata extracted: type=${legalMetadata.documentType.type}, confidence=${legalMetadata.confidence.overall}`,
          );
        }
      }
    }

    const result = await this.legalDepartmentService.process({
      context,
      userMessage,
      documents: processedDocuments || rawDocuments,
      legalMetadata,
    });

    return {
      outputType: 'json',
      content: {
        conversationId: context.conversationId,
        status: result.status,
        userMessage: result.userMessage,
        response: result.response,
        specialistOutputs: result.specialistOutputs,
        legalMetadata: result.legalMetadata,
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (
      buf: Buffer,
    ) => Promise<{ text: string; numpages: number }>;
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
