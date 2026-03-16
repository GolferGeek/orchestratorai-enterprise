import { Injectable, Logger } from '@nestjs/common';
import {
  IDocumentExtractor,
  ExtractionResult,
} from '../interfaces/document-extractor.interface';

export interface TextExtractionResult {
  text: string;
  metadata: Record<string, unknown>;
}

/**
 * Plain Text Extraction Service
 *
 * Handles .txt and .md files by converting buffer to string.
 */
@Injectable()
export class TextExtractorService implements IDocumentExtractor {
  private readonly logger = new Logger(TextExtractorService.name);

  /**
   * Check if text extraction is available
   */
  isAvailable(): boolean {
    return true; // Text extraction is always available
  }

  /**
   * Extract text from a text/markdown buffer (internal method)
   */
  private extractInternal(buffer: Buffer): TextExtractionResult {
    try {
      // Detect encoding (default to UTF-8)
      const text = buffer.toString('utf-8').trim();

      // Remove BOM if present
      const cleanText = text.replace(/^\uFEFF/, '');

      this.logger.debug(
        `Extracted ${cleanText.length} characters from text file`,
      );

      return {
        text: cleanText,
        metadata: {},
      };
    } catch (error) {
      this.logger.error(
        `Text extraction failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(
        `Failed to extract text: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Extract text and metadata (IDocumentExtractor interface)
   */
  extract(buffer: Buffer): Promise<ExtractionResult> {
    const result = this.extractInternal(buffer);
    return Promise.resolve({
      text: result.text,
      metadata: result.metadata,
    });
  }

  /**
   * Extract text as string
   */
  extractText(buffer: Buffer): Promise<string> {
    const result = this.extractInternal(buffer);
    return Promise.resolve(result.text);
  }
}
