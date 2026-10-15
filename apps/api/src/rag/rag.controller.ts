import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  InternalServerErrorException,
  Req,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../rbac/guards/rbac.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
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
import { createHash } from 'node:crypto';

/** The request after RbacGuard: the organization it checked rag:admin in ('*' only for a super-admin who named none). */
interface CheckedRequest {
  organizationSlug?: string;
}

/** The organization RbacGuard checked rag:admin in. */
function checkedOrganization(request: CheckedRequest): string {
  if (!request.organizationSlug) {
    throw new InternalServerErrorException(
      'RbacGuard did not bind an organization to this request',
    );
  }
  return request.organizationSlug;
}

/**
 * The organization a route acts on: the one RbacGuard checked. A request
 * naming another one is refused. Only a super-admin with no organization
 * selected ('*') acts on the one named, or on every organization when it
 * names none (undefined).
 */
function scopedOrganization(
  request: CheckedRequest,
  named: string | undefined,
): string | undefined {
  const checked = checkedOrganization(request);
  if (checked === '*') return named;
  if (named !== undefined && named !== checked) {
    throw new ForbiddenException(
      `rag:admin was checked in ${checked}, not ${named}`,
    );
  }
  return checked;
}

@ApiTags('rag')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('rag:admin')
@Controller('rag')
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
    @Req() request: CheckedRequest,
    @Query('orgSlug') orgSlug?: string,
  ): Promise<RagCollectionsResponse> {
    return this.ragManagementService.listCollections(
      scopedOrganization(request, orgSlug),
    );
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
    @Req() request: CheckedRequest,
    @Param('id') id: string,
    @Query('orgSlug') orgSlug?: string,
  ): Promise<RagCollection> {
    const organization = scopedOrganization(request, orgSlug);
    const collection = await this.collectionInScope(request, id);
    // A super-admin who names an organization gets the collection only there.
    if (organization !== undefined && collection.orgSlug !== organization) {
      throw new ForbiddenException(
        `Collection ${id} is not in ${organization}`,
      );
    }
    return collection;
  }

  @Post('collections')
  @ApiOperation({
    summary: 'Create a RAG collection',
    description: 'Creates a new RAG collection in the database.',
  })
  @ApiResponse({ status: 201, description: 'Collection created' })
  async createCollection(
    @Req() request: CheckedRequest,
    @Body() dto: CreateRagCollectionDto,
  ): Promise<RagCollection> {
    if (!dto.orgSlug) {
      throw new BadRequestException('orgSlug is required');
    }
    scopedOrganization(request, dto.orgSlug);
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
    @Req() request: CheckedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateRagCollectionDto,
  ): Promise<RagCollection> {
    await this.collectionInScope(request, id);
    return this.ragManagementService.updateCollection(id, dto);
  }

  @Delete('collections/:id')
  @ApiOperation({
    summary: 'Delete a RAG collection',
    description: 'Deletes a RAG collection from the database.',
  })
  @ApiParam({ name: 'id', description: 'Collection ID' })
  @ApiResponse({ status: 200, description: 'Collection deleted' })
  async deleteCollection(
    @Req() request: CheckedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    await this.collectionInScope(request, id);
    return this.ragManagementService.deleteCollection(id);
  }

  @Get('collections/:id/documents')
  @ApiOperation({
    summary: 'List documents in a RAG collection',
    description: 'Returns all documents in a RAG collection from the database.',
  })
  @ApiParam({ name: 'id', description: 'Collection ID' })
  @ApiResponse({ status: 200, description: 'Documents in collection' })
  async listDocuments(
    @Req() request: CheckedRequest,
    @Param('id') id: string,
  ): Promise<RagDocumentsResponse> {
    await this.collectionInScope(request, id);
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
    @Req() request: CheckedRequest,
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
    // The collection (in the checked organization) gives the orgSlug
    const collection = await this.collectionInScope(request, collectionId);
    const orgSlug = collection.orgSlug;

    const filename = file.originalname;
    const fileType = this.resolveFileType(filename, file.mimetype);

    const document = await this.ragManagementService.uploadDocument(
      collectionId,
      orgSlug,
      filename,
      fileType,
      file.size,
      createHash('sha256').update(file.buffer).digest('hex'),
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
    @Req() request: CheckedRequest,
    @Param('id') collectionId: string,
    @Param('documentId') documentId: string,
  ): Promise<void> {
    await this.collectionInScope(request, collectionId);
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
    @Req() request: CheckedRequest,
    @Param('id') collectionId: string,
    @Param('documentId') documentId: string,
  ): Promise<RagChunk[]> {
    await this.collectionInScope(request, collectionId);
    return this.ragManagementService.getDocumentChunks(
      collectionId,
      documentId,
    );
  }

  /**
   * The collection, when it belongs to the organization RbacGuard checked
   * rag:admin in (any organization for a super-admin with none selected);
   * 403 otherwise.
   */
  private async collectionInScope(
    request: CheckedRequest,
    collectionId: string,
  ): Promise<RagCollection> {
    const checked = checkedOrganization(request);
    const collection =
      await this.ragManagementService.getCollection(collectionId);
    if (checked !== '*' && collection.orgSlug !== checked) {
      throw new ForbiddenException(
        `Collection ${collectionId} is not in ${checked}`,
      );
    }
    return collection;
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
