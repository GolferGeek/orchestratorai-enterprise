import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateCollectionDto, UpdateCollectionDto } from './dto';
import { RagComplexityType } from './dto/create-collection.dto';
import {
  RAG_STORAGE_SERVICE,
  RagStorageService,
  RagCollection,
  EMBEDDING_SERVICE,
  EmbeddingServiceProvider,
} from '../rag-storage';

export { RagCollection };

@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);

  constructor(
    @Inject(RAG_STORAGE_SERVICE)
    private ragStorage: RagStorageService,
    @Inject(EMBEDDING_SERVICE)
    private embeddingService: EmbeddingServiceProvider,
  ) {}

  /**
   * Generate slug from name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * List all collections for an organization
   */
  async getCollections(
    organizationSlug: string,
    userId?: string,
  ): Promise<RagCollection[]> {
    return this.ragStorage.getCollections(organizationSlug, userId);
  }

  /**
   * Get a single collection by ID
   */
  async getCollection(
    collectionId: string,
    organizationSlug: string,
  ): Promise<RagCollection> {
    const collection = await this.ragStorage.getCollection(
      collectionId,
      organizationSlug,
    );

    if (!collection) {
      throw new NotFoundException(`Collection ${collectionId} not found`);
    }

    return collection;
  }

  /**
   * Create a new collection
   */
  async createCollection(
    organizationSlug: string,
    dto: CreateCollectionDto,
    userId?: string,
  ): Promise<RagCollection> {
    const slug = dto.slug || this.generateSlug(dto.name);
    const embeddingModel = dto.embeddingModel || 'nomic-embed-text';
    const embeddingDimensions =
      this.embeddingService.getDimensions(embeddingModel);

    let allowedUsers = dto.allowedUsers || null;
    if (dto.privateToCreator && userId) {
      allowedUsers = [userId];
    }

    return this.ragStorage.createCollection(organizationSlug, {
      name: dto.name,
      slug,
      description: dto.description || null,
      embeddingModel,
      embeddingDimensions,
      chunkSize: dto.chunkSize || 1000,
      chunkOverlap: dto.chunkOverlap || 200,
      createdBy: userId || null,
      requiredRole: dto.requiredRole || null,
      allowedUsers,
      complexityType: dto.complexityType || 'basic',
    });
  }

  /**
   * Update a collection
   */
  async updateCollection(
    collectionId: string,
    organizationSlug: string,
    dto: UpdateCollectionDto,
  ): Promise<RagCollection> {
    const updated = await this.ragStorage.updateCollection(
      collectionId,
      organizationSlug,
      {
        name: dto.name || null,
        description: dto.description || null,
        requiredRole: dto.requiredRole !== undefined ? dto.requiredRole : null,
        allowedUsers: dto.allowedUsers || null,
        clearAllowedUsers: dto.clearAllowedUsers || false,
        complexityType: (dto.complexityType as RagComplexityType) || null,
      },
    );

    if (!updated) {
      throw new NotFoundException(`Collection ${collectionId} not found`);
    }

    return updated;
  }

  /**
   * Delete a collection
   */
  async deleteCollection(
    collectionId: string,
    organizationSlug: string,
  ): Promise<boolean> {
    const deleted = await this.ragStorage.deleteCollection(
      collectionId,
      organizationSlug,
    );

    if (!deleted) {
      throw new NotFoundException(`Collection ${collectionId} not found`);
    }

    return true;
  }
}
