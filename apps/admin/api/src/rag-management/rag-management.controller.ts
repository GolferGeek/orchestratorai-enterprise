import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import {
  RagManagementService,
  RagCollectionsResponse,
  RagCollection,
  CreateRagCollectionDto,
  RagDocumentsResponse,
} from './rag-management.service';

@ApiTags('rag-management')
@ApiBearerAuth('JWT-auth')
@Controller('admin/rag')
export class RagManagementController {
  constructor(private readonly ragManagementService: RagManagementService) {}

  @Get('collections')
  @ApiOperation({
    summary: 'List RAG collections',
    description: 'Returns all RAG collections from the database.',
  })
  @ApiResponse({ status: 200, description: 'List of RAG collections' })
  async listCollections(): Promise<RagCollectionsResponse> {
    return this.ragManagementService.listCollections();
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
}
