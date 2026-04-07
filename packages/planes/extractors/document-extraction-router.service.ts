import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  ExtractionResult,
  VisionExecutionContext,
} from './document-extractor.interface';
import { TextExtractorService } from './text-extractor.service';
import { PdfExtractorService } from './pdf-extractor.service';
import { DocxExtractorService } from './docx-extractor.service';
import { JsonExtractorService } from './json-extractor.service';
import { CsvExtractorService } from './csv-extractor.service';
import { PptxExtractorService } from './pptx-extractor.service';
import { VisionExtractorService } from './vision-extractor.service';

/**
 * DocumentExtractionRouter — picks the right extractor for a (filename, mime
 * type) pair and orchestrates fallbacks.
 *
 * Routing rules:
 *   image/*                → vision extractor (if available)
 *   application/pdf        → native PDF text first; if < 100 chars and the
 *                            vision extractor is available, fall back to
 *                            vision (handles scanned PDFs)
 *   application/vnd...wordprocessingml.document  (.docx)  → docx extractor
 *   application/vnd...presentationml.presentation (.pptx) → pptx extractor
 *   application/json       → json extractor
 *   text/csv               → csv extractor
 *   text/plain | text/markdown | text/* → text extractor
 *   anything else          → text extractor (best-effort, may produce noise)
 *
 * Every product (Forge, Compose, Pulse, Bridge, Assistant) injects this
 * single service and gets back the same `ExtractionResult` shape regardless
 * of file type. ExecutionContext is required only when vision extraction
 * might fire — pass it in for safety even when you think you have a text
 * file.
 */
@Injectable()
export class DocumentExtractionRouter {
  private readonly logger = new Logger(DocumentExtractionRouter.name);
  private static readonly NATIVE_PDF_TEXT_FLOOR = 100;

  constructor(
    private readonly text: TextExtractorService,
    private readonly pdf: PdfExtractorService,
    private readonly docx: DocxExtractorService,
    private readonly json: JsonExtractorService,
    private readonly csv: CsvExtractorService,
    private readonly pptx: PptxExtractorService,
    @Optional() private readonly vision?: VisionExtractorService,
  ) {}

  /**
   * Extract text from a buffer based on its mime type / filename.
   *
   * @param buffer    Raw bytes
   * @param mimeType  MIME type if known. May be empty — we'll fall back to filename.
   * @param filename  Original filename for extension sniffing if mime is missing
   * @param context   Vision-capable ExecutionContext, required if vision might fire
   */
  async extract(args: {
    buffer: Buffer;
    mimeType?: string;
    filename?: string;
    context?: VisionExecutionContext;
  }): Promise<ExtractionResult> {
    const mime = (args.mimeType || this.guessMime(args.filename)).toLowerCase();
    this.logger.log(
      `Extraction request: mime=${mime} filename=${args.filename ?? '(none)'} bytes=${args.buffer.length}`,
    );

    if (mime.startsWith('image/')) {
      if (!this.vision || !this.vision.isAvailable()) {
        throw new Error(
          `Image extraction requires the vision extractor (image: ${mime})`,
        );
      }
      if (!args.context) {
        throw new Error(
          'Vision extraction requires a VisionExecutionContext (orgSlug, userId, conversationId, …).',
        );
      }
      return this.vision.extract(args.buffer, mime, args.context);
    }

    if (mime === 'application/pdf' || args.filename?.toLowerCase().endsWith('.pdf')) {
      await this.pdf.ensureInitialized();
      if (this.pdf.isAvailable()) {
        try {
          const pdfText = await this.pdf.extractText(args.buffer);
          if (pdfText.length >= DocumentExtractionRouter.NATIVE_PDF_TEXT_FLOOR) {
            const result = await this.pdf.extract(args.buffer);
            return {
              text: result.text,
              metadata: { ...result.metadata, extractor: 'pdf-native' },
            };
          }
          this.logger.log(
            `Native PDF text below floor (${pdfText.length} < ${DocumentExtractionRouter.NATIVE_PDF_TEXT_FLOOR}); attempting vision fallback`,
          );
        } catch (error) {
          this.logger.warn(
            `Native PDF extraction failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (this.vision?.isAvailable() && args.context) {
        return this.vision.extract(args.buffer, 'application/pdf', args.context);
      }
      // Best-effort: return whatever the native extractor produced even if short
      const result = await this.pdf.extract(args.buffer);
      return {
        text: result.text,
        metadata: { ...result.metadata, extractor: 'pdf-native', warning: 'short-text' },
      };
    }

    if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      args.filename?.toLowerCase().endsWith('.docx')
    ) {
      const result = await this.docx.extract(args.buffer);
      return { text: result.text, metadata: { ...result.metadata, extractor: 'docx' } };
    }

    if (
      mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      args.filename?.toLowerCase().endsWith('.pptx')
    ) {
      return this.pptx.extract(args.buffer);
    }

    if (mime === 'application/json' || args.filename?.toLowerCase().endsWith('.json')) {
      return this.json.extract(args.buffer);
    }

    if (mime === 'text/csv' || args.filename?.toLowerCase().endsWith('.csv')) {
      return this.csv.extract(args.buffer);
    }

    // text/plain, text/markdown, text/*, or anything we don't recognize
    const result = await this.text.extract(args.buffer);
    return { text: result.text, metadata: { ...result.metadata, extractor: 'text' } };
  }

  /**
   * Convenience: get just the extracted text.
   */
  async extractText(args: {
    buffer: Buffer;
    mimeType?: string;
    filename?: string;
    context?: VisionExecutionContext;
  }): Promise<string> {
    const result = await this.extract(args);
    return result.text;
  }

  private guessMime(filename: string | undefined): string {
    if (!filename) return 'text/plain';
    const ext = filename.toLowerCase().split('.').pop() ?? '';
    const map: Record<string, string> = {
      txt: 'text/plain',
      md: 'text/markdown',
      json: 'application/json',
      csv: 'text/csv',
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
    };
    return map[ext] ?? 'application/octet-stream';
  }
}
