import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  STORAGE_SERVICE,
  MediaStorageProvider,
} from '@/planes/storage/media-storage-provider.interface';
import { DATABASE_SERVICE, DatabaseService, QueryResult } from '@/database';
import { ExecutionContext } from '@orchestrator-ai/transport-types';
import { randomUUID } from 'crypto';
import { VisionExtractionService } from './vision-extraction.service';
import { OCRExtractionService } from './ocr-extraction.service';
import {
  LegalIntelligenceService,
  LegalMetadata,
} from './legal-intelligence.service';
import { PdfExtractorService } from '@/rag/extractors/pdf-extractor.service';

/**
 * Document metadata from file upload
 */
export interface DocumentMetadata {
  /** Original filename */
  filename: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** Base64-encoded file data */
  base64Data: string;
  /** Extraction method used (vision/ocr) */
  extractionMethod?: 'vision' | 'ocr';
  /** Extracted text content */
  extractedText?: string;
  /** Vision model used (if vision extraction) */
  visionModel?: string;
  /** OCR confidence score (if OCR extraction) */
  ocrConfidence?: number;
}

/**
 * Document processing result
 */
export interface ProcessedDocumentResult {
  /** Document ID (UUID) */
  documentId: string;
  /** Public URL to access the document */
  url: string;
  /** Storage path within bucket */
  storagePath: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Extracted text content (if applicable) */
  extractedText?: string;
  /** Extraction method used */
  extractionMethod?: 'vision' | 'ocr' | 'none';
  /** Legal metadata extracted from document (if applicable) */
  legalMetadata?: LegalMetadata;
}

/**
 * Document Processing Service
 *
 * Handles processing of document files for Legal Department AI:
 * 1. Accepts base64-encoded files from metadata
 * 2. Determines if document needs text extraction (images, scanned PDFs)
 * 3. Routes to VisionExtractionService or OCRExtractionService
 * 4. Uploads original file to legal-documents storage bucket
 * 5. Returns document metadata with extracted text
 *
 * Storage Structure:
 * ```
 * legal-documents/
 *   {orgSlug}/
 *     {conversationId}/
 *       {taskId}/
 *         {uuid}_{filename}
 * ```
 *
 * ExecutionContext Flow:
 * - Uses context.orgSlug for organization path
 * - Uses context.conversationId for conversation path
 * - Uses context.taskId for task path
 * - Uses context.userId for document ownership
 *
 * Text Extraction:
 * - Image files (PNG, JPG, JPEG, WEBP): Vision extraction (primary), OCR (fallback)
 * - Scanned PDFs: Vision extraction (primary), OCR (fallback)
 * - Native PDFs: pdf-parse (direct text extraction)
 * - Word docs (DOCX): mammoth (direct text extraction)
 * - Text files: Direct read
 *
 * @example
 * ```typescript
 * const result = await documentProcessing.processDocument(
 *   {
 *     filename: 'contract.pdf',
 *     mimeType: 'application/pdf',
 *     size: 12345,
 *     base64Data: 'data:application/pdf;base64,...'
 *   },
 *   executionContext
 * );
 * // result: { documentId: '...', url: 'https://...', extractedText: '...', ... }
 * ```
 */
@Injectable()
export class DocumentProcessingService {
  private readonly logger = new Logger(DocumentProcessingService.name);
  private readonly bucketName: string;
  private readonly publicApiUrl: string | undefined;

  constructor(
    @Inject(DATABASE_SERVICE) private readonly db: DatabaseService,
    @Inject(STORAGE_SERVICE) private readonly storage: MediaStorageProvider,
    private readonly configService: ConfigService,
    private readonly visionExtraction: VisionExtractionService,
    private readonly ocrExtraction: OCRExtractionService,
    private readonly legalIntelligence: LegalIntelligenceService,
    private readonly pdfExtractor: PdfExtractorService,
  ) {
    this.bucketName =
      this.configService.get<string>('LEGAL_DOCUMENTS_BUCKET') ??
      'legal-documents';
    this.publicApiUrl = this.configService.get<string>('PUBLIC_API_URL');
  }

  /**
   * Process a document file from base64 metadata
   *
   * @param metadata - Document metadata with base64 data
   * @param context - ExecutionContext for ownership and path construction
   * @returns ProcessedDocumentResult with documentId, url, extractedText
   */
  async processDocument(
    metadata: DocumentMetadata,
    context: ExecutionContext,
  ): Promise<ProcessedDocumentResult> {
    this.logger.log(
      `📄 [DOC-PROCESSING] Processing document: ${metadata.filename} (${metadata.mimeType}, ${metadata.size} bytes)`,
    );

    // Decode base64 data to buffer
    const buffer = this.decodeBase64(metadata.base64Data);

    // Determine if text extraction is needed
    const needsExtraction = this.needsTextExtraction(metadata.mimeType);
    let extractedText: string | undefined;
    let extractionMethod: 'vision' | 'ocr' | 'none' = 'none';

    // For text files, read directly from buffer
    if (
      metadata.mimeType === 'text/plain' ||
      metadata.mimeType === 'text/markdown'
    ) {
      this.logger.log(
        `📄 [DOC-PROCESSING] Text file detected, reading content directly`,
      );
      extractedText = buffer.toString('utf-8');
      extractionMethod = 'none'; // Native text, no extraction needed
      this.logger.log(
        `📄 [DOC-PROCESSING] Text content read (${extractedText.length} chars)`,
      );
    } else if (needsExtraction) {
      // Use vision extraction for images and scanned PDFs
      if (this.isImageFile(metadata.mimeType)) {
        this.logger.log(
          `📄 [DOC-PROCESSING] Image file detected, using vision extraction`,
        );
        try {
          const visionResult = await this.visionExtraction.extractText(
            buffer,
            metadata.mimeType,
            context,
          );
          extractedText = visionResult.text;
          extractionMethod = 'vision';
          this.logger.log(
            `📄 [DOC-PROCESSING] Vision extraction successful (${extractedText.length} chars)`,
          );
        } catch (error) {
          this.logger.warn(
            `📄 [DOC-PROCESSING] Vision extraction failed, falling back to OCR: ${error instanceof Error ? error.message : String(error)}`,
          );
          // Fallback to OCR
          const ocrResult = await this.ocrExtraction.extractText(
            buffer,
            metadata.mimeType,
          );
          extractedText = ocrResult.text;
          extractionMethod = 'ocr';
          this.logger.log(
            `📄 [DOC-PROCESSING] OCR extraction successful (${extractedText.length} chars)`,
          );
        }
      } else if (metadata.mimeType === 'application/pdf') {
        // For PDFs, try native text extraction first (faster, works for native PDFs)
        // Only fall back to Vision for scanned PDFs with minimal/no text
        this.logger.log(
          `📄 [DOC-PROCESSING] PDF file detected, attempting native text extraction first`,
        );

        let nativeText: string | undefined;

        // Ensure PDF extractor is initialized before checking availability
        await this.pdfExtractor.ensureInitialized();

        // Try native PDF text extraction first
        if (this.pdfExtractor.isAvailable()) {
          try {
            nativeText = await this.pdfExtractor.extractText(buffer);
            this.logger.log(
              `📄 [DOC-PROCESSING] Native PDF extraction returned ${nativeText?.length || 0} chars`,
            );
          } catch (nativeError) {
            this.logger.warn(
              `📄 [DOC-PROCESSING] Native PDF extraction failed: ${nativeError instanceof Error ? nativeError.message : String(nativeError)}`,
            );
          }
        } else {
          this.logger.warn(
            `📄 [DOC-PROCESSING] Native PDF extractor not available`,
          );
        }

        // If native extraction got meaningful text (> 100 chars), use it
        // Otherwise, fall back to Vision extraction (for scanned PDFs)
        const MIN_TEXT_LENGTH_FOR_NATIVE = 100;

        if (
          nativeText &&
          nativeText.trim().length > MIN_TEXT_LENGTH_FOR_NATIVE
        ) {
          extractedText = nativeText;
          extractionMethod = 'none'; // Native text extraction, not vision/ocr
          this.logger.log(
            `📄 [DOC-PROCESSING] Using native PDF text extraction (${extractedText.length} chars)`,
          );
        } else {
          // Native extraction got little/no text - likely a scanned PDF
          // Try Vision extraction
          this.logger.log(
            `📄 [DOC-PROCESSING] Native extraction insufficient (${nativeText?.trim().length || 0} chars), trying vision extraction for scanned PDF`,
          );
          try {
            const visionResult = await this.visionExtraction.extractText(
              buffer,
              metadata.mimeType,
              context,
            );
            extractedText = visionResult.text;
            extractionMethod = 'vision';
            this.logger.log(
              `📄 [DOC-PROCESSING] Vision extraction successful (${extractedText.length} chars)`,
            );
          } catch (visionError) {
            // Vision failed - if we have any native text, use it as last resort
            if (nativeText && nativeText.trim().length > 0) {
              this.logger.warn(
                `📄 [DOC-PROCESSING] Vision extraction failed, using limited native text: ${visionError instanceof Error ? visionError.message : String(visionError)}`,
              );
              extractedText = nativeText;
              extractionMethod = 'none';
            } else {
              this.logger.error(
                `📄 [DOC-PROCESSING] All PDF extraction methods failed: ${visionError instanceof Error ? visionError.message : String(visionError)}`,
              );
              // Set empty text to indicate extraction failure
              extractedText = '';
              extractionMethod = 'none';
            }
          }
        }
      }
    }

    // Upload to storage
    const documentId = randomUUID();
    const storagePath = this.buildStoragePath(
      context,
      documentId,
      metadata.filename,
    );

    this.logger.log(`📄 [DOC-PROCESSING] Uploading to storage: ${storagePath}`);

    let publicUrl: string;
    try {
      await this.storage.upload(this.bucketName, storagePath, buffer, {
        contentType: metadata.mimeType,
        upsert: false,
      });

      // Get public URL (API-proxied if PUBLIC_API_URL is set)
      if (this.publicApiUrl) {
        const base = this.publicApiUrl.replace(/\/$/, '');
        publicUrl = `${base}/assets/storage/${this.bucketName}/${storagePath}`;
      } else {
        publicUrl = this.storage.getPublicUrl(this.bucketName, storagePath);
      }
    } catch (uploadError) {
      const message =
        uploadError instanceof Error
          ? uploadError.message
          : String(uploadError);
      this.logger.error(`📄 [DOC-PROCESSING] Upload failed: ${message}`);
      throw new Error(`Failed to upload document: ${message}`);
    }

    this.logger.log(
      `📄 [DOC-PROCESSING] Document uploaded successfully: ${publicUrl}`,
    );

    // Extract legal metadata if text was extracted
    let legalMetadata: LegalMetadata | undefined;
    if (extractedText && extractedText.trim().length > 0) {
      this.logger.log(
        `📄 [DOC-PROCESSING] Extracting legal metadata from ${extractedText.length} chars of text`,
      );
      try {
        legalMetadata = await this.legalIntelligence.extractMetadata(
          extractedText,
          context,
        );
        this.logger.log(
          `📄 [DOC-PROCESSING] Legal metadata extracted: ${this.legalIntelligence.getSummary(legalMetadata)}`,
        );

        // Store document extraction in database
        if (legalMetadata) {
          await this.storeDocumentExtraction({
            documentId,
            storagePath,
            filename: metadata.filename,
            mimeType: metadata.mimeType,
            sizeBytes: metadata.size,
            extractedText,
            extractionMethod,
            legalMetadata,
            context,
          });
        }
      } catch (error) {
        // Log error but don't fail the entire document processing
        this.logger.error(
          `📄 [DOC-PROCESSING] Legal metadata extraction failed (non-fatal): ${error instanceof Error ? error.message : String(error)}`,
        );
        // Continue without legal metadata
      }
    } else {
      this.logger.log(
        `📄 [DOC-PROCESSING] Skipping legal metadata extraction (no text extracted)`,
      );
    }

    return {
      documentId,
      url: publicUrl,
      storagePath,
      mimeType: metadata.mimeType,
      sizeBytes: metadata.size,
      extractedText,
      extractionMethod,
      legalMetadata,
    };
  }

  /**
   * Decode base64 data to buffer
   * Handles both data URLs (data:mime;base64,xxx) and raw base64
   */
  private decodeBase64(base64Data: string): Buffer {
    // Remove data URL prefix if present
    const base64 = base64Data.includes(',')
      ? base64Data.split(',')[1]
      : base64Data;

    if (!base64) {
      throw new Error('Invalid base64 data: empty after processing');
    }

    return Buffer.from(base64, 'base64');
  }

  /**
   * Check if file type needs text extraction
   */
  private needsTextExtraction(mimeType: string): boolean {
    const extractionTypes = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/gif',
      'application/pdf',
    ];

    return extractionTypes.includes(mimeType);
  }

  /**
   * Check if file is an image
   */
  private isImageFile(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  /**
   * Build storage path from ExecutionContext
   * Structure: {orgSlug}/{conversationId}/{taskId}/{uuid}_{filename}
   */
  private buildStoragePath(
    context: ExecutionContext,
    documentId: string,
    filename: string,
  ): string {
    const orgSlug = context.orgSlug || 'global';
    const conversationId = context.conversationId || 'unknown';
    const taskId = context.taskId || 'unknown';

    // Sanitize filename (remove path traversal attempts and dangerous characters)
    // 1. Remove path components (only keep basename)
    const basename = filename.split('/').pop()?.split('\\').pop() || 'file';

    // 2. Replace path traversal sequences and other dangerous patterns
    let sanitizedFilename = basename
      .replace(/\.\./g, '') // Remove all .. sequences
      .replace(/[/\\]/g, '_') // Replace slashes with underscores
      .replace(/[^a-zA-Z0-9._-]/g, '_'); // Replace other special chars with underscores

    // 3. Ensure filename doesn't start with a dot (hidden files)
    if (sanitizedFilename.startsWith('.')) {
      sanitizedFilename = '_' + sanitizedFilename.slice(1);
    }

    // 4. Ensure we have a valid filename
    if (!sanitizedFilename || sanitizedFilename === '_') {
      sanitizedFilename = 'file';
    }

    return `${orgSlug}/${conversationId}/${taskId}/${documentId}_${sanitizedFilename}`;
  }

  /**
   * Store document extraction and legal metadata in database
   * Maps LegalMetadataService output to law.document_extractions table
   *
   * @param params - Document and legal metadata to store
   */
  private async storeDocumentExtraction(params: {
    documentId: string;
    storagePath: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    extractedText: string;
    extractionMethod: 'vision' | 'ocr' | 'none';
    legalMetadata: LegalMetadata;
    context: ExecutionContext;
  }): Promise<void> {
    const {
      documentId,
      storagePath,
      filename,
      mimeType,
      sizeBytes,
      extractedText,
      extractionMethod,
      legalMetadata,
      context,
    } = params;

    this.logger.log(
      `📄 [DOC-PROCESSING] Storing document extraction in database: ${documentId}`,
    );

    // First, we need to get or create an analysis_task_id
    // For now, we'll use taskId from context if available
    // TODO: In future phases, create analysis_task record first
    if (!context.taskId) {
      this.logger.warn(
        `📄 [DOC-PROCESSING] No taskId in context, skipping database storage`,
      );
      return;
    }

    // Check if analysis_task exists
    const { data: analysisTaskData, error: analysisTaskError } = (await this.db
      .from('law', 'analysis_tasks')
      .select('id')
      .eq('task_id', context.taskId)
      .maybeSingle()) as QueryResult<unknown>;

    if (analysisTaskError) {
      this.logger.error(
        `📄 [DOC-PROCESSING] Error checking analysis_task: ${analysisTaskError.message}`,
      );
      throw new Error(
        `Failed to check analysis_task: ${analysisTaskError.message}`,
      );
    }

    let analysisTaskId: string;

    if (!analysisTaskData) {
      // Create analysis_task record
      this.logger.log(
        `📄 [DOC-PROCESSING] Creating analysis_task record for task ${context.taskId}`,
      );

      const { data: newAnalysisTask, error: createError } = (await this.db
        .from('law', 'analysis_tasks')
        .insert({
          task_id: context.taskId,
          conversation_id: context.conversationId,
          organization_slug: context.orgSlug,
          user_id: context.userId,
          status: 'extracting',
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single()) as QueryResult<unknown>;

      if (createError) {
        this.logger.error(
          `📄 [DOC-PROCESSING] Error creating analysis_task: ${createError.message}`,
        );
        throw new Error(
          `Failed to create analysis_task: ${createError.message}`,
        );
      }

      analysisTaskId = (newAnalysisTask as { id: string }).id;
    } else {
      analysisTaskId = (analysisTaskData as { id: string }).id;
    }

    // Map extraction method to database enum
    const dbExtractionMethod = this.mapExtractionMethod(
      extractionMethod,
      mimeType,
    );

    // Map file type to database enum
    const fileType = this.mapFileType(mimeType);

    // Build document extraction record
    const documentExtraction = {
      id: documentId,
      analysis_task_id: analysisTaskId,
      original_filename: filename,
      storage_path: storagePath,
      file_type: fileType,
      file_size_bytes: sizeBytes,
      mime_type: mimeType,
      extraction_method: dbExtractionMethod,
      extracted_text: extractedText,

      // Legal metadata fields
      document_type: legalMetadata.documentType.type,
      document_type_confidence: legalMetadata.documentType.confidence,
      detected_sections:
        legalMetadata.sections.sections.length > 0
          ? legalMetadata.sections.sections
          : null,
      has_signatures: legalMetadata.signatures.signatures.length > 0,
      signature_blocks:
        legalMetadata.signatures.signatures.length > 0
          ? legalMetadata.signatures.signatures
          : null,
      extracted_dates:
        legalMetadata.dates.dates.length > 0 ? legalMetadata.dates.dates : null,
      extracted_parties:
        legalMetadata.parties.parties.length > 0
          ? legalMetadata.parties.parties
          : null,
      extraction_confidence: legalMetadata.confidence.overall,

      // Additional metadata in metadata column
      metadata: {
        extractedAt: legalMetadata.extractedAt,
        confidenceBreakdown: legalMetadata.confidence.breakdown,
        structureType: legalMetadata.sections.structureType,
      },
    };

    const { error: insertError } = await this.db
      .from('law', 'document_extractions')
      .insert(documentExtraction);

    if (insertError) {
      this.logger.error(
        `📄 [DOC-PROCESSING] Error storing document extraction: ${insertError.message}`,
      );
      throw new Error(
        `Failed to store document extraction: ${insertError.message}`,
      );
    }

    this.logger.log(
      `📄 [DOC-PROCESSING] Document extraction stored successfully: ${documentId}`,
    );
  }

  /**
   * Map extraction method to database enum
   */
  private mapExtractionMethod(
    method: 'vision' | 'ocr' | 'none',
    mimeType: string,
  ): string {
    if (method === 'vision') {
      return 'vision_model';
    } else if (method === 'ocr') {
      return 'ocr';
    } else if (mimeType === 'application/pdf') {
      return 'pdf_text';
    } else if (
      mimeType.includes('wordprocessingml') ||
      mimeType.includes('docx')
    ) {
      return 'docx_parse';
    } else {
      return 'direct_read';
    }
  }

  /**
   * Map MIME type to database file_type enum
   */
  private mapFileType(mimeType: string): string {
    if (mimeType === 'application/pdf') {
      return 'pdf'; // Vision extraction will determine if scanned
    } else if (
      mimeType.includes('wordprocessingml') ||
      mimeType.includes('docx')
    ) {
      return 'docx';
    } else if (mimeType.includes('msword')) {
      return 'doc';
    } else if (mimeType.startsWith('image/')) {
      return 'image';
    } else if (mimeType === 'text/plain') {
      return 'txt';
    } else if (mimeType === 'text/markdown') {
      return 'md';
    } else {
      return 'pdf'; // Default fallback
    }
  }
}
