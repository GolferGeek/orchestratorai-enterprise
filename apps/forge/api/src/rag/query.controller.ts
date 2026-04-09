import {
  Controller,
  Post,
  Param,
  Body,
  Headers,
  UseGuards,
  Request,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  InProcessJwtAuthGuard as JwtAuthGuard,
  InProcessRbacGuard as RbacGuard,
  RequirePermission,
} from '@orchestratorai/auth-client';
import { QueryService, QueryResponse } from './query.service';
import { CollectionsService } from './collections.service';
import { QueryCollectionDto } from './dto';

interface AuthenticatedRequest {
  user: {
    id: string;
    email?: string;
  };
}

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

@Controller('api/rag/collections/:collectionId/query')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('rag:read')
export class QueryController {
  constructor(
    private queryService: QueryService,
    private collectionsService: CollectionsService,
  ) {}

  /**
   * Query a collection for relevant chunks
   * POST /api/rag/collections/:collectionId/query
   * Header: x-organization-slug (required)
   * Access control: User must have access to the collection
   */
  @Post()
  async queryCollection(
    @Param('collectionId') collectionId: string,
    @Body() dto: QueryCollectionDto,
    @Request() req: AuthenticatedRequest,
    @Headers('x-organization-slug') orgSlug?: string,
  ): Promise<QueryResponse> {
    const organizationSlug = getOrgSlug(orgSlug);
    const userId = req.user.id;

    // Check if user has access to this collection
    const collection = await this.collectionsService.getCollection(
      collectionId,
      organizationSlug,
    );

    // Check access: NULL/undefined allowed_users = everyone, or user must be in list or be creator
    if (
      collection.allowedUsers != null &&
      Array.isArray(collection.allowedUsers)
    ) {
      const hasAccess =
        collection.createdBy === userId ||
        collection.allowedUsers.includes(userId);

      if (!hasAccess) {
        throw new ForbiddenException(
          'You do not have access to query this collection',
        );
      }
    }

    return this.queryService.queryCollection(
      collectionId,
      organizationSlug,
      dto,
      collection.embeddingModel,
    );
  }
}
