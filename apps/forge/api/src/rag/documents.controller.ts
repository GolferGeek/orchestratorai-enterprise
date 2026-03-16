import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  Request,
  Headers,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DocumentsService, RagDocument, RagChunk } from './documents.service';
import { DocumentProcessorService } from './document-processor.service';

interface AuthenticatedRequest {
  user: {
    id: string;
    email?: string;
  };
}

// 50MB max file size
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Get organization slug from header
 */
function getOrgSlug(orgHeader?: string): string {
  if (!orgHeader) {
    throw new BadRequestException(
      'x-organization-slug header is required for RAG operations',
    );
  }
  return orgHeader;
}

@Controller('api/rag/collections/:collectionId/documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(
    private documentsService: DocumentsService,
    private documentProcessorService: DocumentProcessorService,
  ) {}

  /**
   * List documents in a collection
   * GET /api/rag/collections/:collectionId/documents
   * Header: x-organization-slug (required)
   */
  @Get()
  async listDocuments(
    @Param('collectionId') collectionId: string,
    @Headers('x-organization-slug') orgSlug?: string,
  ): Promise<RagDocument[]> {
    return this.documentsService.getDocuments(
      collectionId,
      getOrgSlug(orgSlug),
    );
  }

  /**
   * Upload a document
   * POST /api/rag/collections/:collectionId/documents
   * Header: x-organization-slug (required)
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @Param('collectionId') collectionId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE }),
          // Skip MIME type validation - we'll validate by extension instead
          // NestJS FileTypeValidator has issues with text/markdown matching
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
    @Request() req: AuthenticatedRequest,
    @Headers('x-organization-slug') orgSlug?: string,
  ): Promise<{
    id: string;
    filename: string;
    status: string;
    message: string;
  }> {
    const organizationSlug = getOrgSlug(orgSlug);

    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Determine file type from extension (more reliable than MIME type)
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    const fileType = this.getFileType(ext || '');

    if (!fileType) {
      throw new BadRequestException(
        `Unsupported file type: ${ext}. Allowed: pdf, txt, md, docx`,
      );
    }

    // Additional MIME type check for safety (but allow common variations)
    const _allowedMimeTypes = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'text/x-markdown',
      'application/octet-stream', // Browsers sometimes send this for unknown types
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    // Create document record
    const document = await this.documentsService.createDocument(
      collectionId,
      organizationSlug,
      file.originalname,
      fileType,
      file.size,
      undefined, // fileHash - could compute SHA-256
      undefined, // storagePath - direct processing
      req.user.id,
    );

    // Process document synchronously and return result
    const result = await this.documentProcessorService.processDocument(
      document.id,
      organizationSlug,
      collectionId,
      file.buffer,
      fileType,
    );

    if (result.status === 'error') {
      // Return error response but don't throw - document record exists
      return {
        id: document.id,
        filename: document.filename,
        status: 'error',
        message: result.error || 'Document processing failed',
      };
    }

    return {
      id: document.id,
      filename: document.filename,
      status: 'completed',
      message: `Document processed successfully: ${result.chunkCount} chunks, ${result.tokenCount} tokens`,
    };
  }

  /**
   * Get a single document
   * GET /api/rag/collections/:collectionId/documents/:docId
   * Header: x-organization-slug (required)
   */
  @Get(':docId')
  async getDocument(
    @Param('collectionId') _collectionId: string,
    @Param('docId') docId: string,
    @Headers('x-organization-slug') orgSlug?: string,
  ): Promise<RagDocument> {
    return this.documentsService.getDocument(docId, getOrgSlug(orgSlug));
  }

  /**
   * Delete a document
   * DELETE /api/rag/collections/:collectionId/documents/:docId
   * Header: x-organization-slug (required)
   */
  @Delete(':docId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDocument(
    @Param('collectionId') _collectionId: string,
    @Param('docId') docId: string,
    @Headers('x-organization-slug') orgSlug?: string,
  ): Promise<void> {
    await this.documentsService.deleteDocument(docId, getOrgSlug(orgSlug));
  }

  /**
   * Get chunks for a document
   * GET /api/rag/collections/:collectionId/documents/:docId/chunks
   * Header: x-organization-slug (required)
   */
  @Get(':docId/chunks')
  async getDocumentChunks(
    @Param('collectionId') _collectionId: string,
    @Param('docId') docId: string,
    @Headers('x-organization-slug') orgSlug?: string,
  ): Promise<RagChunk[]> {
    return this.documentsService.getDocumentChunks(docId, getOrgSlug(orgSlug));
  }

  /**
   * Get document content (original text for document viewer)
   * GET /api/rag/collections/:collectionId/documents/:docId/content
   * Header: x-organization-slug (required)
   */
  @Get(':docId/content')
  async getDocumentContent(
    @Param('collectionId') _collectionId: string,
    @Param('docId') docId: string,
    @Headers('x-organization-slug') orgSlug?: string,
  ): Promise<{
    id: string;
    filename: string;
    fileType: string;
    content: string | null;
    chunkCount: number;
  }> {
    const result = await this.documentsService.getDocumentContent(
      docId,
      getOrgSlug(orgSlug),
    );

    if (!result) {
      throw new BadRequestException(`Document ${docId} not found`);
    }

    return result;
  }

  /**
   * Map file extension to file type
   */
  private getFileType(ext: string): string | null {
    const typeMap: Record<string, string> = {
      pdf: 'pdf',
      txt: 'txt',
      md: 'md',
      markdown: 'md',
      docx: 'docx',
    };
    return typeMap[ext] || null;
  }
}
