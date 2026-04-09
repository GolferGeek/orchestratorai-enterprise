import { Inject, Injectable, Logger } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { CollectionsService } from './collections.service';
import { ChunkingService, Chunk } from './chunking.service';
import { EMBEDDING_SERVICE, EmbeddingServiceProvider } from '../rag-storage';
import { PdfExtractorService, DocxExtractorService, TextExtractorService } from '@orchestratorai/planes/extractors';

/**
 * Document Processor Service
 *
 * Handles the async processing pipeline for uploaded documents:
 * 1. Extract text from document
 * 2. Chunk the text
 * 3. Generate embeddings
 * 4. Store chunks in database
 */
@Injectable()
export class DocumentProcessorService {
  private readonly logger = new Logger(DocumentProcessorService.name);
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 1000;

  constructor(
    private documentsService: DocumentsService,
    private collectionsService: CollectionsService,
    private chunkingService: ChunkingService,
    @Inject(EMBEDDING_SERVICE)
    private embeddingService: EmbeddingServiceProvider,
    private pdfExtractor: PdfExtractorService,
    private docxExtractor: DocxExtractorService,
    private textExtractor: TextExtractorService,
  ) {}

  /**
   * Process a document synchronously and return result
   */
  async processDocument(
    documentId: string,
    organizationSlug: string,
    collectionId: string,
    buffer: Buffer,
    fileType: string,
  ): Promise<{
    status: 'completed' | 'error';
    chunkCount?: number;
    tokenCount?: number;
    error?: string;
  }> {
    return this.processDocumentSync(
      documentId,
      organizationSlug,
      collectionId,
      buffer,
      fileType,
    );
  }

  /**
   * Process a document (fire and forget - runs async) - DEPRECATED, use processDocument instead
   */
  processDocumentAsync(
    documentId: string,
    organizationSlug: string,
    collectionId: string,
    buffer: Buffer,
    fileType: string,
  ): void {
    // Start processing in background
    this.processDocumentSync(
      documentId,
      organizationSlug,
      collectionId,
      buffer,
      fileType,
    ).catch((error) => {
      this.logger.error(
        `Document processing failed for ${documentId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  /**
   * Synchronous document processing with retry logic - returns result
   */
  private async processDocumentSync(
    documentId: string,
    organizationSlug: string,
    collectionId: string,
    buffer: Buffer,
    fileType: string,
  ): Promise<{
    status: 'completed' | 'error';
    chunkCount?: number;
    tokenCount?: number;
    error?: string;
  }> {
    this.logger.log(`Starting processing for document ${documentId}`);

    try {
      // Update status to processing
      await this.documentsService.updateDocumentStatus(
        documentId,
        organizationSlug,
        'processing',
      );

      // 1. Extract text from document
      const extractionResult = await this.extractText(buffer, fileType);

      if (!extractionResult.text || extractionResult.text.trim().length === 0) {
        throw new Error('No text content extracted from document');
      }

      this.logger.debug(
        `Extracted ${extractionResult.text.length} characters from document ${documentId}`,
      );

      // 1b. Store the original content in the document record
      await this.documentsService.updateDocumentContent(
        documentId,
        organizationSlug,
        extractionResult.text,
      );

      // 2. Get collection configuration for chunking
      const collection = await this.collectionsService.getCollection(
        collectionId,
        organizationSlug,
      );

      // 3. Chunk the text
      let chunks: Chunk[];

      if (extractionResult.pages) {
        // PDF with page information
        chunks = this.chunkingService.splitTextWithPages(
          extractionResult.pages,
          {
            chunkSize: collection.chunkSize,
            chunkOverlap: collection.chunkOverlap,
          },
        );
      } else {
        // Plain text
        chunks = this.chunkingService.splitText(extractionResult.text, {
          chunkSize: collection.chunkSize,
          chunkOverlap: collection.chunkOverlap,
        });
      }

      if (chunks.length === 0) {
        throw new Error('No chunks generated from document');
      }

      this.logger.debug(
        `Generated ${chunks.length} chunks for document ${documentId}`,
      );

      // 4. Generate embeddings with retry logic
      const chunksWithEmbeddings = await this.generateEmbeddingsWithRetry(
        chunks,
        collection.embeddingModel,
      );

      // Calculate total token count
      const totalTokenCount = chunksWithEmbeddings.reduce(
        (sum, c) => sum + c.tokenCount,
        0,
      );

      // 5. Store chunks in database
      const insertedCount = await this.documentsService.insertChunks(
        documentId,
        organizationSlug,
        chunksWithEmbeddings.map((c) => ({
          content: c.content,
          chunkIndex: c.chunkIndex,
          embedding: c.embedding,
          tokenCount: c.tokenCount,
          pageNumber: c.pageNumber,
          charOffset: c.charOffset,
          metadata: c.metadata,
        })),
      );

      // 6. Update document status to completed
      await this.documentsService.updateDocumentStatus(
        documentId,
        organizationSlug,
        'completed',
        undefined,
        insertedCount,
        totalTokenCount,
      );

      this.logger.log(
        `Successfully processed document ${documentId}: ${insertedCount} chunks stored`,
      );

      return {
        status: 'completed',
        chunkCount: insertedCount,
        tokenCount: totalTokenCount,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Document processing failed for ${documentId}: ${errorMessage}`,
      );

      // Update status to error
      await this.documentsService.updateDocumentStatus(
        documentId,
        organizationSlug,
        'error',
        errorMessage,
      );

      return {
        status: 'error',
        error: errorMessage,
      };
    }
  }

  /**
   * Extract text from document based on file type
   */
  private async extractText(
    buffer: Buffer,
    fileType: string,
  ): Promise<{
    text: string;
    pages?: Array<{ content: string; pageNumber: number }>;
  }> {
    switch (fileType) {
      case 'pdf': {
        // Use extractPages for PDF to get page information
        const result = await this.pdfExtractor.extractPages(buffer);
        return {
          text: result.text,
          pages: result.pages,
        };
      }

      case 'docx': {
        const result = await this.docxExtractor.extract(buffer);
        return { text: result.text };
      }

      case 'txt':
      case 'md': {
        const result = await this.textExtractor.extract(buffer);
        return { text: result.text };
      }

      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  }

  /**
   * Generate embeddings for chunks with retry logic
   */
  private async generateEmbeddingsWithRetry(
    chunks: Chunk[],
    embeddingModel: string,
  ): Promise<Array<Chunk & { embedding: number[]; tokenCount: number }>> {
    const results: Array<Chunk & { embedding: number[]; tokenCount: number }> =
      [];

    // Process in batches
    const batchSize = 10;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map((c) => c.content);

      let retries = 0;
      let embeddings: Array<{
        embedding: number[];
        tokenCount: number;
      }> | null = null;

      while (retries < this.maxRetries && !embeddings) {
        try {
          embeddings = await this.embeddingService.embedBatch(
            texts,
            embeddingModel,
          );
        } catch (error) {
          retries++;
          if (retries >= this.maxRetries) {
            throw new Error(
              `Embedding generation failed after ${this.maxRetries} retries: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
          this.logger.warn(
            `Embedding generation failed, retrying (${retries}/${this.maxRetries})...`,
          );
          await this.sleep(this.retryDelayMs * retries);
        }
      }

      if (!embeddings) {
        throw new Error('Embedding generation failed');
      }

      // Combine chunks with embeddings
      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const embeddingResult = embeddings[j];
        if (chunk && embeddingResult) {
          results.push({
            ...chunk,
            embedding: embeddingResult.embedding,
            tokenCount: embeddingResult.tokenCount,
          });
        }
      }

      // Log progress for large documents
      if (chunks.length > 50 && i > 0) {
        this.logger.debug(
          `Embedding progress: ${Math.min(i + batchSize, chunks.length)}/${chunks.length}`,
        );
      }
    }

    return results;
  }

  /**
   * Sleep helper for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
