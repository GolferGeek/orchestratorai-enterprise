/**
 * Common interface for all document extractors
 *
 * This interface standardizes the extraction pattern across
 * all document types (PDF, DOCX, TXT, etc.)
 */

/**
 * Base extraction result that all extractors must return
 */
export interface ExtractionResult {
  /**
   * Extracted text content
   */
  text: string;

  /**
   * Metadata about the document
   */
  metadata: ExtractionMetadata;
}

/**
 * Metadata returned by document extractors
 */
export interface ExtractionMetadata {
  /**
   * Document title (if available)
   */
  title?: string;

  /**
   * Document author (if available)
   */
  author?: string;

  /**
   * Number of pages (for paginated documents like PDF)
   */
  pageCount?: number;

  /**
   * Creation date (if available)
   */
  creationDate?: string;

  /**
   * Additional extractor-specific metadata
   */
  [key: string]: unknown;
}

/**
 * Interface that all document extractors must implement
 */
export interface IDocumentExtractor {
  /**
   * Check if this extractor is available
   * (e.g., if optional dependencies are installed)
   */
  isAvailable(): boolean;

  /**
   * Extract text and metadata from a document buffer
   *
   * @param buffer - The document buffer to extract from
   * @returns Extraction result with text and metadata
   * @throws Error if extraction fails or extractor is not available
   */
  extract(buffer: Buffer): Promise<ExtractionResult>;

  /**
   * Extract only text from a document buffer
   * Convenience method for cases where metadata is not needed
   *
   * @param buffer - The document buffer to extract from
   * @returns Extracted text content
   * @throws Error if extraction fails or extractor is not available
   */
  extractText(buffer: Buffer): Promise<string>;
}

/**
 * Extended interface for extractors that support page-based extraction
 * (e.g., PDF)
 */
export interface IPagedDocumentExtractor extends IDocumentExtractor {
  /**
   * Extract text organized by pages
   *
   * @param buffer - The document buffer to extract from
   * @returns Extraction result with pages array
   * @throws Error if extraction fails or extractor is not available
   */
  extractPages?(buffer: Buffer): Promise<PagedExtractionResult>;
}

/**
 * Result for paged document extraction
 */
export interface PagedExtractionResult extends ExtractionResult {
  /**
   * Array of pages with individual content
   */
  pages: PageContent[];
}

/**
 * Content of a single page
 */
export interface PageContent {
  /**
   * Text content of the page
   */
  content: string;

  /**
   * Page number (1-indexed)
   */
  pageNumber: number;
}
