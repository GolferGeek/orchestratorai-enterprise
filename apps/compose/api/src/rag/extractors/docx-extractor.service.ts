import { Injectable, Logger } from '@nestjs/common';
import {
  IDocumentExtractor,
  ExtractionResult,
  ExtractionMetadata,
} from '../interfaces/document-extractor.interface';

export interface DocxExtractionResult {
  text: string;
  metadata: {
    title?: string;
    author?: string;
  };
}

/**
 * DOCX Text Extraction Service
 *
 * Uses mammoth library to extract text from Word documents.
 */
@Injectable()
export class DocxExtractorService implements IDocumentExtractor {
  private readonly logger = new Logger(DocxExtractorService.name);
  private mammoth: {
    extractRawText: (options: { buffer: Buffer }) => Promise<{ value: string }>;
  } | null = null;

  constructor() {
    void this.initMammoth();
  }

  private async initMammoth() {
    try {
      // Dynamic import to handle optional dependency
      const module = await import('mammoth');
      this.mammoth = module.default || module;
    } catch {
      this.logger.warn(
        'mammoth not installed. DOCX extraction disabled. Run: npm install mammoth',
      );
    }
  }

  /**
   * Check if DOCX extraction is available
   */
  isAvailable(): boolean {
    return this.mammoth !== null;
  }

  /**
   * Extract text from a DOCX buffer (internal method)
   */
  private async extractDocx(buffer: Buffer): Promise<DocxExtractionResult> {
    if (!this.mammoth) {
      throw new Error(
        'DOCX extraction not available. Install mammoth: npm install mammoth',
      );
    }

    try {
      const result = await this.mammoth.extractRawText({ buffer });

      this.logger.debug(
        `Extracted ${result.value.length} characters from DOCX`,
      );

      return {
        text: result.value.trim(),
        metadata: {
          // mammoth doesn't extract metadata, would need different library
        },
      };
    } catch (error) {
      this.logger.error(
        `DOCX extraction failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(
        `Failed to extract text from DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Extract text and metadata (IDocumentExtractor interface)
   */
  async extract(buffer: Buffer): Promise<ExtractionResult> {
    const docxResult = await this.extractDocx(buffer);

    const metadata: ExtractionMetadata = {
      title: docxResult.metadata.title,
      author: docxResult.metadata.author,
    };

    return {
      text: docxResult.text,
      metadata,
    };
  }

  /**
   * Extract text from DOCX as a single string
   */
  async extractText(buffer: Buffer): Promise<string> {
    const result = await this.extractDocx(buffer);
    return result.text;
  }
}
