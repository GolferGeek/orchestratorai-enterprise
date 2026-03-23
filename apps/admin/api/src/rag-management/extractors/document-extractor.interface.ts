/**
 * Common interface for all document extractors
 */

export interface ExtractionResult {
  text: string;
  metadata: ExtractionMetadata;
}

export interface ExtractionMetadata {
  title?: string;
  author?: string;
  pageCount?: number;
  creationDate?: string;
  [key: string]: unknown;
}

export interface IDocumentExtractor {
  isAvailable(): boolean;
  extract(buffer: Buffer): Promise<ExtractionResult>;
  extractText(buffer: Buffer): Promise<string>;
}

export interface IPagedDocumentExtractor extends IDocumentExtractor {
  extractPages?(buffer: Buffer): Promise<PagedExtractionResult>;
}

export interface PagedExtractionResult extends ExtractionResult {
  pages: PageContent[];
}

export interface PageContent {
  content: string;
  pageNumber: number;
}
