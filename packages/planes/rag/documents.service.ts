import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  RAG_STORAGE_SERVICE,
  RagStorageService,
  RagDocument,
  RagChunk,
} from './rag-storage.interface';

export { RagDocument, RagChunk };

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @Inject(RAG_STORAGE_SERVICE)
    private ragStorage: RagStorageService,
  ) {}

  /**
   * List documents for a collection
   */
  async getDocuments(
    collectionId: string,
    organizationSlug: string,
  ): Promise<RagDocument[]> {
    return this.ragStorage.getDocuments(collectionId, organizationSlug);
  }

  /**
   * Get a single document
   */
  async getDocument(
    documentId: string,
    organizationSlug: string,
  ): Promise<RagDocument> {
    const doc = await this.ragStorage.getDocument(documentId, organizationSlug);

    if (!doc) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    return doc;
  }

  /**
   * Create a document record (before processing)
   */
  async createDocument(
    collectionId: string,
    organizationSlug: string,
    filename: string,
    fileType: string,
    fileSize: number,
    fileHash?: string,
    storagePath?: string,
    userId?: string,
    content?: string,
  ): Promise<RagDocument> {
    const doc = await this.ragStorage.insertDocument(
      collectionId,
      organizationSlug,
      {
        filename,
        fileType,
        fileSize,
        fileHash: fileHash || null,
        storagePath: storagePath || null,
        createdBy: userId || null,
        content: content || null,
      },
    );

    this.logger.log(
      `Created document ${filename} (${doc.id}) in collection ${collectionId}`,
    );

    return doc;
  }

  /**
   * Update document content (after text extraction)
   */
  async updateDocumentContent(
    documentId: string,
    organizationSlug: string,
    content: string,
  ): Promise<void> {
    await this.ragStorage.updateDocumentContent(
      documentId,
      organizationSlug,
      content,
    );

    this.logger.log(`Updated content for document ${documentId}`);
  }

  /**
   * Get document content only (for document viewer)
   */
  async getDocumentContent(
    documentId: string,
    organizationSlug: string,
  ): Promise<{
    id: string;
    filename: string;
    fileType: string;
    content: string | null;
    chunkCount: number;
  } | null> {
    return this.ragStorage.getDocumentContent(documentId, organizationSlug);
  }

  /**
   * Update document status
   */
  async updateDocumentStatus(
    documentId: string,
    organizationSlug: string,
    status: RagDocument['status'],
    errorMessage?: string,
    chunkCount?: number,
    tokenCount?: number,
  ): Promise<RagDocument> {
    const doc = await this.ragStorage.updateDocumentStatus(
      documentId,
      organizationSlug,
      status,
      errorMessage,
      chunkCount,
      tokenCount,
    );

    if (!doc) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    return doc;
  }

  /**
   * Delete a document
   */
  async deleteDocument(
    documentId: string,
    organizationSlug: string,
  ): Promise<boolean> {
    const deleted = await this.ragStorage.deleteDocument(
      documentId,
      organizationSlug,
    );

    if (!deleted) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    this.logger.log(`Deleted document ${documentId}`);

    return true;
  }

  /**
   * Delete all chunks for a document (used before reprocessing)
   */
  async deleteDocumentChunks(
    documentId: string,
    organizationSlug: string,
  ): Promise<number> {
    const count = await this.ragStorage.deleteDocumentChunks(
      documentId,
      organizationSlug,
    );

    this.logger.log(
      `Deleted ${count} chunks for document ${documentId}`,
    );

    return count;
  }

  /**
   * Get chunks for a document
   */
  async getDocumentChunks(
    documentId: string,
    organizationSlug: string,
  ): Promise<RagChunk[]> {
    return this.ragStorage.getDocumentChunks(documentId, organizationSlug);
  }

  /**
   * Insert chunks for a document
   */
  async insertChunks(
    documentId: string,
    organizationSlug: string,
    chunks: Array<{
      content: string;
      chunkIndex: number;
      embedding?: number[];
      tokenCount: number;
      pageNumber?: number;
      charOffset?: number;
      metadata?: Record<string, unknown>;
    }>,
  ): Promise<number> {
    const chunkInputs = chunks.map((chunk) => ({
      content: chunk.content,
      chunkIndex: chunk.chunkIndex,
      embedding: chunk.embedding || null,
      tokenCount: chunk.tokenCount,
      pageNumber: chunk.pageNumber ?? null,
      charOffset: chunk.charOffset ?? null,
      metadata: chunk.metadata || {},
    }));

    const insertedCount = await this.ragStorage.insertChunks(
      documentId,
      organizationSlug,
      chunkInputs,
    );

    this.logger.log(
      `Inserted ${insertedCount} chunks for document ${documentId}`,
    );

    return insertedCount;
  }
}
