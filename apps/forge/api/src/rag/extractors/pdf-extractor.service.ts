import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  IPagedDocumentExtractor,
  ExtractionResult,
  PagedExtractionResult,
  PageContent,
  ExtractionMetadata,
} from '../interfaces/document-extractor.interface';

export interface PdfPage {
  content: string;
  pageNumber: number;
}

export interface PdfExtractionResult {
  pages: PdfPage[];
  metadata: {
    title?: string;
    author?: string;
    pageCount: number;
    creationDate?: string;
  };
}

/**
 * PDF Text Extraction Service
 *
 * Uses pdf2json library to extract text from PDF documents.
 * pdf2json is a pure JavaScript library that works in Node.js without browser APIs.
 * Returns text organized by page for better chunk metadata.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PDFParserClass = any;

@Injectable()
export class PdfExtractorService
  implements IPagedDocumentExtractor, OnModuleInit
{
  private readonly logger = new Logger(PdfExtractorService.name);
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  private PDFParser: PDFParserClass | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Start initialization immediately but track the promise
    this.initPromise = this.initPdf2Json();
  }

  /**
   * NestJS lifecycle hook - ensures initialization completes before service is used
   */
  async onModuleInit() {
    await this.initPromise;
    this.logger.log(
      `PdfExtractorService initialized, available: ${this.isAvailable()}`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async initPdf2Json() {
    try {
      // pdf2json exports a class that we need to instantiate per document
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
      const pdf2json = require('pdf2json');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      this.PDFParser = pdf2json.default || pdf2json;
      this.logger.log('pdf2json loaded successfully');
    } catch (error) {
      this.logger.warn(
        `pdf2json initialization failed: ${error instanceof Error ? error.message : String(error)}. PDF extraction disabled.`,
      );
    }
  }

  /**
   * Ensure initialization is complete before checking availability
   */
  async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  /**
   * Check if PDF extraction is available
   */
  isAvailable(): boolean {
    return this.PDFParser !== null;
  }

  /**
   * Extract text from a PDF buffer (internal method)
   */
  private async extractPdf(buffer: Buffer): Promise<PdfExtractionResult> {
    if (!this.PDFParser) {
      throw new Error('PDF extraction not available. pdf2json not loaded.');
    }

    return new Promise((resolve, reject) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const pdfParser = new this.PDFParser(null, true); // true = suppress logging

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        pdfParser.on(
          'pdfParser_dataError',
          (errData: { parserError: Error }) => {
            reject(
              new Error(`PDF parsing failed: ${errData.parserError.message}`),
            );
          },
        );

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        pdfParser.on(
          'pdfParser_dataReady',
          (pdfData: {
            Pages?: Array<{
              Texts?: Array<{
                R?: Array<{ T?: string }>;
              }>;
            }>;
            Meta?: {
              Title?: string;
              Author?: string;
              CreationDate?: string;
            };
          }) => {
            try {
              const pages: PdfPage[] = [];

              if (pdfData.Pages) {
                pdfData.Pages.forEach((page, index) => {
                  const pageTexts: string[] = [];

                  if (page.Texts) {
                    page.Texts.forEach((textBlock) => {
                      if (textBlock.R) {
                        textBlock.R.forEach((run) => {
                          if (run.T) {
                            // Decode URI-encoded text
                            try {
                              const decodedText = decodeURIComponent(run.T);
                              pageTexts.push(decodedText);
                            } catch {
                              pageTexts.push(run.T);
                            }
                          }
                        });
                      }
                    });
                  }

                  const pageText = pageTexts
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                  if (pageText.length > 0) {
                    pages.push({
                      content: pageText,
                      pageNumber: index + 1,
                    });
                  }
                });
              }

              const metadata = {
                title: pdfData.Meta?.Title,
                author: pdfData.Meta?.Author,
                pageCount: pdfData.Pages?.length || 0,
                creationDate: pdfData.Meta?.CreationDate,
              };

              this.logger.debug(
                `Extracted ${pages.length} pages from PDF (${metadata.pageCount} total)`,
              );

              resolve({
                pages,
                metadata,
              });
            } catch (processError) {
              reject(
                new Error(
                  `Failed to process PDF data: ${processError instanceof Error ? processError.message : String(processError)}`,
                ),
              );
            }
          },
        );

        // Parse the buffer
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        pdfParser.parseBuffer(buffer);
      } catch (error) {
        reject(
          new Error(
            `PDF extraction failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
    });
  }

  /**
   * Extract text and metadata (IDocumentExtractor interface)
   */
  async extract(buffer: Buffer): Promise<ExtractionResult> {
    const pdfResult = await this.extractPdf(buffer);

    const metadata: ExtractionMetadata = {
      title: pdfResult.metadata.title,
      author: pdfResult.metadata.author,
      pageCount: pdfResult.metadata.pageCount,
      creationDate: pdfResult.metadata.creationDate,
    };

    return {
      text: pdfResult.pages.map((p) => p.content).join('\n\n'),
      metadata,
    };
  }

  /**
   * Extract text from PDF as a single string
   */
  async extractText(buffer: Buffer): Promise<string> {
    const result = await this.extractPdf(buffer);
    return result.pages.map((p) => p.content).join('\n\n');
  }

  /**
   * Extract pages organized by page number (IPagedDocumentExtractor interface)
   */
  async extractPages(buffer: Buffer): Promise<PagedExtractionResult> {
    const pdfResult = await this.extractPdf(buffer);

    const pages: PageContent[] = pdfResult.pages.map((page) => ({
      content: page.content,
      pageNumber: page.pageNumber,
    }));

    const metadata: ExtractionMetadata = {
      title: pdfResult.metadata.title,
      author: pdfResult.metadata.author,
      pageCount: pdfResult.metadata.pageCount,
      creationDate: pdfResult.metadata.creationDate,
    };

    return {
      text: pages.map((p) => p.content).join('\n\n'),
      metadata,
      pages,
    };
  }
}
