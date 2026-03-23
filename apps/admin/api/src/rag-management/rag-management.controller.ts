import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import {
  RagManagementService,
  RagCollectionsResponse,
  RagCollection,
  CreateRagCollectionDto,
  UpdateRagCollectionDto,
  RagDocumentsResponse,
  RagDocument,
  RagChunk,
} from './rag-management.service';
import { DocumentProcessorService } from './document-processor.service';

@ApiTags('rag-management')
@ApiBearerAuth('JWT-auth')
@Controller('admin/rag')
export class RagManagementController {
  constructor(
    private readonly ragManagementService: RagManagementService,
    private readonly documentProcessorService: DocumentProcessorService,
  ) {}

  @Get('collections')
  @ApiOperation({
    summary: 'List RAG collections',
    description:
      'Returns RAG collections, optionally filtered by organization slug.',
  })
  @ApiQuery({
    name: 'orgSlug',
    required: false,
    description: 'Filter by organization slug',
  })
  @ApiResponse({ status: 200, description: 'List of RAG collections' })
  async listCollections(
    @Query('orgSlug') orgSlug?: string,
  ): Promise<RagCollectionsResponse> {
    return this.ragManagementService.listCollections(orgSlug);
  }

  @Get('collections/:id')
  @ApiOperation({
    summary: 'Get a RAG collection',
    description: 'Returns a single RAG collection by ID.',
  })
  @ApiParam({ name: 'id', description: 'Collection ID' })
  @ApiQuery({
    name: 'orgSlug',
    required: false,
    description: 'Organization slug (optional filter)',
  })
  @ApiResponse({ status: 200, description: 'RAG collection' })
  async getCollection(
    @Param('id') id: string,
    @Query('orgSlug') orgSlug?: string,
  ): Promise<RagCollection> {
    return this.ragManagementService.getCollection(id, orgSlug);
  }

  @Post('collections')
  @ApiOperation({
    summary: 'Create a RAG collection',
    description: 'Creates a new RAG collection in the database.',
  })
  @ApiResponse({ status: 201, description: 'Collection created' })
  async createCollection(
    @Body() dto: CreateRagCollectionDto,
  ): Promise<RagCollection> {
    return this.ragManagementService.createCollection(dto);
  }

  @Patch('collections/:id')
  @ApiOperation({
    summary: 'Update a RAG collection',
    description: 'Updates an existing RAG collection.',
  })
  @ApiParam({ name: 'id', description: 'Collection ID' })
  @ApiResponse({ status: 200, description: 'Collection updated' })
  async updateCollection(
    @Param('id') id: string,
    @Body() dto: UpdateRagCollectionDto,
  ): Promise<RagCollection> {
    return this.ragManagementService.updateCollection(id, dto);
  }

  @Delete('collections/:id')
  @ApiOperation({
    summary: 'Delete a RAG collection',
    description: 'Deletes a RAG collection from the database.',
  })
  @ApiParam({ name: 'id', description: 'Collection ID' })
  @ApiResponse({ status: 200, description: 'Collection deleted' })
  async deleteCollection(@Param('id') id: string): Promise<void> {
    return this.ragManagementService.deleteCollection(id);
  }

  @Get('collections/:id/documents')
  @ApiOperation({
    summary: 'List documents in a RAG collection',
    description: 'Returns all documents in a RAG collection from the database.',
  })
  @ApiParam({ name: 'id', description: 'Collection ID' })
  @ApiResponse({ status: 200, description: 'Documents in collection' })
  async listDocuments(@Param('id') id: string): Promise<RagDocumentsResponse> {
    return this.ragManagementService.listDocuments(id);
  }

  @Post('collections/:id/documents')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload a document to a RAG collection',
    description:
      'Uploads a document, extracts text, chunks it, generates embeddings, and stores everything.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Document file upload',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiParam({ name: 'id', description: 'Collection ID' })
  @ApiResponse({ status: 201, description: 'Document uploaded and processed' })
  async uploadDocument(
    @Param('id') collectionId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<
    RagDocument & {
      processingResult: {
        status: string;
        chunkCount?: number;
        tokenCount?: number;
        error?: string;
      };
    }
  > {
    // Look up the collection to get orgSlug — no need for client to send it
    const collection =
      await this.ragManagementService.getCollection(collectionId);
    const orgSlug = collection.orgSlug;

    const filename = file.originalname;
    const fileType = this.resolveFileType(filename, file.mimetype);

    const document = await this.ragManagementService.uploadDocument(
      collectionId,
      orgSlug,
      filename,
      fileType,
      file.size,
    );

    const processingResult =
      await this.documentProcessorService.processDocument(
        document.id,
        orgSlug,
        collectionId,
        file.buffer,
        fileType,
      );

    return { ...document, processingResult };
  }

  @Delete('collections/:id/documents/:documentId')
  @ApiOperation({
    summary: 'Delete a document from a RAG collection',
    description: 'Deletes a document and its chunks from the database.',
  })
  @ApiParam({ name: 'id', description: 'Collection ID' })
  @ApiParam({ name: 'documentId', description: 'Document ID' })
  @ApiResponse({ status: 200, description: 'Document deleted' })
  async deleteDocument(
    @Param('id') collectionId: string,
    @Param('documentId') documentId: string,
  ): Promise<void> {
    return this.ragManagementService.deleteDocument(collectionId, documentId);
  }

  @Get('collections/:id/documents/:documentId/chunks')
  @ApiOperation({
    summary: 'Get chunks for a document',
    description:
      'Returns all stored chunks for a document in a RAG collection.',
  })
  @ApiParam({ name: 'id', description: 'Collection ID' })
  @ApiParam({ name: 'documentId', description: 'Document ID' })
  @ApiResponse({ status: 200, description: 'Document chunks' })
  async getDocumentChunks(
    @Param('id') collectionId: string,
    @Param('documentId') documentId: string,
  ): Promise<RagChunk[]> {
    return this.ragManagementService.getDocumentChunks(
      collectionId,
      documentId,
    );
  }

  /**
   * Resolve file type string from filename and MIME type.
   * Used to route document extraction.
   */
  private resolveFileType(filename: string, mimetype: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();

    if (ext === 'pdf' || mimetype === 'application/pdf') {
      return 'pdf';
    }
    if (
      ext === 'docx' ||
      mimetype ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return 'docx';
    }
    if (ext === 'md' || mimetype === 'text/markdown') {
      return 'md';
    }
    // Default to txt for all other text-like types
    return 'txt';
  }
}
