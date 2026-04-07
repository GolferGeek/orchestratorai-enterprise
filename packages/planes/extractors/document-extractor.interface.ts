/**
 * Document Extractor — shared contracts for every extractor in the planes/extractors plane.
 *
 * Every product (Forge, Compose, Pulse, Bridge, Assistant) injects extractors via
 * the same DI tokens and gets back the same `ExtractionResult` shape, regardless
 * of the underlying file type or implementation.
 *
 * The router service `DocumentExtractionRouter` picks the right extractor for a
 * given mime type and orchestrates fallbacks (e.g. native PDF text → vision for
 * scanned PDFs).
 */

export const DOCUMENT_EXTRACTION_ROUTER = Symbol('DOCUMENT_EXTRACTION_ROUTER');

/**
 * Result of a single extraction call.
 */
export interface ExtractionResult {
  /** Extracted plain text. */
  text: string;
  /** Structured metadata (extractor-specific keys are allowed). */
  metadata: ExtractionMetadata;
}

export interface ExtractionMetadata {
  title?: string;
  author?: string;
  pageCount?: number;
  creationDate?: string;
  /** Which extractor produced this result (for observability). */
  extractor?: string;
  /** Confidence score 0–1 if the extractor reports one (vision/OCR). */
  confidence?: number;
  /** Provider/model used (vision only). */
  provider?: string;
  model?: string;
  [key: string]: unknown;
}

/**
 * Base contract every extractor implements.
 */
export interface IDocumentExtractor {
  /** False if optional native dependencies aren't loaded. */
  isAvailable(): boolean;
  /** Extract text + metadata from a buffer. */
  extract(buffer: Buffer): Promise<ExtractionResult>;
  /** Convenience: extract text only. */
  extractText(buffer: Buffer): Promise<string>;
}

/**
 * Page-aware extractor (PDF, paginated DOCX, etc.).
 */
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

/**
 * Vision/image extractors take an extra ExecutionContext-shaped object so the
 * underlying LLM call can be attributed correctly. The extractors plane does
 * not import @orchestrator-ai/transport-types directly to avoid circular
 * package dependencies; products pass an opaque object through.
 */
export interface VisionExecutionContext {
  orgSlug: string;
  userId: string;
  conversationId: string;
  agentSlug: string;
  agentType: string;
  provider: string;
  model: string;
  sovereignMode?: boolean;
}

export interface IVisionExtractor {
  isAvailable(): boolean;
  extract(
    buffer: Buffer,
    mimeType: string,
    context: VisionExecutionContext,
  ): Promise<ExtractionResult>;
}
