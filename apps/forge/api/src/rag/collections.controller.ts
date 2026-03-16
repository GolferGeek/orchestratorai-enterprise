import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CollectionsService, RagCollection } from './collections.service';
import { CreateCollectionDto, UpdateCollectionDto } from './dto';
import { RbacService } from '../rbac/rbac.service';

interface AuthenticatedRequest {
  user: {
    id: string;
    email?: string;
  };
}

/**
 * Get organization slug from header
 * Header: x-organization-slug
 */
function getOrgSlug(orgHeader?: string): string {
  if (!orgHeader) {
    throw new BadRequestException(
      'x-organization-slug header is required for RAG operations',
    );
  }
  return orgHeader;
}

@Controller('api/rag/collections')
@UseGuards(JwtAuthGuard)
export class CollectionsController {
  constructor(
    private collectionsService: CollectionsService,
    private rbacService: RbacService,
  ) {}

  /**
   * List all collections for the organization
   * GET /api/rag/collections
   * Header: x-organization-slug (required)
   * Filters by user access unless user has admin permissions
   * Super-admins see ALL collections (user_id passed as null to bypass filtering)
   */
  @Get()
  async listCollections(
    @Request() req: AuthenticatedRequest,
    @Headers('x-organization-slug') orgSlug?: string,
  ): Promise<RagCollection[]> {
    // Check if user is super-admin
    const isSuperAdmin = await this.rbacService.isSuperAdmin(req.user.id);

    // Super-admins get all collections (pass undefined to bypass access control)
    // Regular users get filtered by their access
    const userId = isSuperAdmin ? undefined : req.user.id;

    return this.collectionsService.getCollections(getOrgSlug(orgSlug), userId);
  }

  /**
   * Get a single collection by ID
   * GET /api/rag/collections/:id
   * Header: x-organization-slug (required)
   */
  @Get(':id')
  async getCollection(
    @Param('id') id: string,
    @Headers('x-organization-slug') orgSlug?: string,
  ): Promise<RagCollection> {
    return this.collectionsService.getCollection(id, getOrgSlug(orgSlug));
  }

  /**
   * Create a new collection
   * POST /api/rag/collections
   * Header: x-organization-slug (required)
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCollection(
    @Body() dto: CreateCollectionDto,
    @Request() req: AuthenticatedRequest,
    @Headers('x-organization-slug') orgSlug?: string,
  ): Promise<RagCollection> {
    return this.collectionsService.createCollection(
      getOrgSlug(orgSlug),
      dto,
      req.user.id,
    );
  }

  /**
   * Update a collection
   * PATCH /api/rag/collections/:id
   * Header: x-organization-slug (required)
   */
  @Patch(':id')
  async updateCollection(
    @Param('id') id: string,
    @Body() dto: UpdateCollectionDto,
    @Headers('x-organization-slug') orgSlug?: string,
  ): Promise<RagCollection> {
    return this.collectionsService.updateCollection(
      id,
      getOrgSlug(orgSlug),
      dto,
    );
  }

  /**
   * Delete a collection
   * DELETE /api/rag/collections/:id
   * Header: x-organization-slug (required)
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCollection(
    @Param('id') id: string,
    @Headers('x-organization-slug') orgSlug?: string,
  ): Promise<void> {
    await this.collectionsService.deleteCollection(id, getOrgSlug(orgSlug));
  }
}
