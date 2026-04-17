/**
 * SentinelController — REST endpoints for Portfolio Sentinel.
 *
 * Routes:
 *   GET    /legal-department/sentinel/sources       — list sources
 *   POST   /legal-department/sentinel/sources       — create source
 *   PATCH  /legal-department/sentinel/sources/:id   — update source
 *   DELETE /legal-department/sentinel/sources/:id   — delete source
 *
 *   GET    /legal-department/sentinel/signals       — list signals
 *
 *   GET    /legal-department/sentinel/portfolio     — list portfolio holdings
 *   POST   /legal-department/sentinel/portfolio     — create holding
 *   PATCH  /legal-department/sentinel/portfolio/:id — update holding
 *   DELETE /legal-department/sentinel/portfolio/:id — deactivate holding
 *
 *   GET    /legal-department/sentinel/alerts        — list alerts
 *   GET    /legal-department/sentinel/alerts/:id    — alert detail
 *   PATCH  /legal-department/sentinel/alerts/:id/status — update alert status
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  InProcessJwtAuthGuard as JwtAuthGuard,
  InProcessRbacGuard as RbacGuard,
  RequirePermission,
} from '@orchestratorai/auth-client';
import {
  RAG_STORAGE_SERVICE,
  type RagStorageService,
} from '@orchestratorai/planes/rag';
import { SentinelRepository } from './sentinel.repository';
import type {
  CreateSourceDto,
  UpdateSourceDto,
  CreatePortfolioDto,
  UpdatePortfolioDto,
  AlertStatus,
} from './sentinel.types';

@Controller('legal-department/sentinel')
@UseGuards(JwtAuthGuard, RbacGuard)
@RequirePermission('agents:execute')
export class SentinelController {
  private readonly logger = new Logger(SentinelController.name);

  constructor(
    private readonly repo: SentinelRepository,
    @Inject(RAG_STORAGE_SERVICE)
    @Optional()
    private readonly ragStorage?: RagStorageService,
  ) {}

  // ── Sources ─────────────────────────────────────────────────────────────

  @Get('sources')
  async listSources(@Query('orgSlug') orgSlug: string) {
    if (!orgSlug) throw new BadRequestException('orgSlug is required');
    return this.repo.listSources(orgSlug);
  }

  @Post('sources')
  async createSource(@Body() body: { orgSlug: string } & CreateSourceDto) {
    const { orgSlug, ...dto } = body;
    if (!orgSlug) throw new BadRequestException('orgSlug is required');
    if (!dto.name) throw new BadRequestException('name is required');
    if (!dto.sourceType)
      throw new BadRequestException('sourceType is required');
    if (!dto.url) throw new BadRequestException('url is required');
    const source = await this.repo.createSource(orgSlug, dto);
    await this.syncSourceTrigger(source);
    return source;
  }

  @Patch('sources/:id')
  async updateSource(
    @Param('id') id: string,
    @Body() body: { orgSlug: string } & UpdateSourceDto,
  ) {
    const { orgSlug, ...dto } = body;
    if (!orgSlug) throw new BadRequestException('orgSlug is required');
    const source = await this.repo.updateSource(id, orgSlug, dto);
    await this.syncSourceTrigger(source);
    return source;
  }

  @Delete('sources/:id')
  async deleteSource(
    @Param('id') id: string,
    @Query('orgSlug') orgSlug: string,
  ) {
    if (!orgSlug) throw new BadRequestException('orgSlug is required');
    await this.repo.deleteSource(id, orgSlug);
    await this.deleteSourceTrigger(id);
    return { deleted: true };
  }

  /**
   * POST /legal-department/sentinel/sources/sync-triggers
   * Bulk-sync all sources for an org to Pulse cron triggers.
   */
  @Post('sources/sync-triggers')
  async syncTriggers(@Body() body: { orgSlug: string }) {
    if (!body.orgSlug) throw new BadRequestException('orgSlug is required');
    const sources = await this.repo.listSources(body.orgSlug);
    let synced = 0;
    for (const source of sources) {
      await this.syncSourceTrigger(source);
      synced++;
    }
    return { synced };
  }

  // ── Signals ─────────────────────────────────────────────────────────────

  @Get('signals')
  async listSignals(
    @Query('orgSlug') orgSlug: string,
    @Query('sourceId') sourceId?: string,
    @Query('signalType') signalType?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (!orgSlug) throw new BadRequestException('orgSlug is required');
    return this.repo.listSignals(orgSlug, {
      sourceId: sourceId || undefined,
      signalType: signalType || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  // ── Portfolio ───────────────────────────────────────────────────────────

  @Get('portfolio')
  async listPortfolio(
    @Query('orgSlug') orgSlug: string,
    @Query('active') active?: string,
  ) {
    if (!orgSlug) throw new BadRequestException('orgSlug is required');
    return this.repo.listPortfolio(orgSlug, {
      active: active !== undefined ? active === 'true' : undefined,
    });
  }

  @Post('portfolio')
  async createPortfolioHolding(
    @Body() body: { orgSlug: string } & CreatePortfolioDto,
  ) {
    const { orgSlug, ...dto } = body;
    if (!orgSlug) throw new BadRequestException('orgSlug is required');
    if (!dto.clientName)
      throw new BadRequestException('clientName is required');
    const holding = await this.repo.createPortfolioHolding(orgSlug, dto);
    await this.ingestHoldingToRag(orgSlug, holding);
    return holding;
  }

  @Patch('portfolio/:id')
  async updatePortfolioHolding(
    @Param('id') id: string,
    @Body() body: { orgSlug: string } & UpdatePortfolioDto,
  ) {
    const { orgSlug, ...dto } = body;
    if (!orgSlug) throw new BadRequestException('orgSlug is required');
    const holding = await this.repo.updatePortfolioHolding(id, orgSlug, dto);
    await this.ingestHoldingToRag(orgSlug, holding);
    return holding;
  }

  @Delete('portfolio/:id')
  async deactivatePortfolioHolding(
    @Param('id') id: string,
    @Query('orgSlug') orgSlug: string,
  ) {
    if (!orgSlug) throw new BadRequestException('orgSlug is required');
    await this.repo.deactivatePortfolioHolding(id, orgSlug);
    // RAG cleanup: best-effort, don't fail the deactivation
    // Note: We don't remove from RAG here — the evaluate workflow
    // queries active holdings only. Stale RAG entries are harmless.
    return { deactivated: true };
  }

  // ── Alerts ──────────────────────────────────────────────────────────────

  @Get('alerts')
  async listAlerts(
    @Query('orgSlug') orgSlug: string,
    @Query('status') status?: AlertStatus,
    @Query('severity') severity?: string,
    @Query('urgency') urgency?: string,
    @Query('portfolioId') portfolioId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (!orgSlug) throw new BadRequestException('orgSlug is required');
    return this.repo.listAlerts(orgSlug, {
      status: status || undefined,
      severity: severity || undefined,
      urgency: urgency || undefined,
      portfolioId: portfolioId || undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('alerts/:id')
  async getAlertDetail(
    @Param('id') id: string,
    @Query('orgSlug') orgSlug: string,
  ) {
    if (!orgSlug) throw new BadRequestException('orgSlug is required');
    const detail = await this.repo.getAlertDetail(id, orgSlug);
    if (!detail) throw new NotFoundException(`Alert ${id} not found`);
    return detail;
  }

  @Patch('alerts/:id/status')
  async updateAlertStatus(
    @Param('id') id: string,
    @Body()
    body: {
      orgSlug: string;
      status: AlertStatus;
      acknowledgedBy?: string;
    },
  ) {
    if (!body.orgSlug) throw new BadRequestException('orgSlug is required');
    if (!body.status) throw new BadRequestException('status is required');
    const validStatuses: AlertStatus[] = [
      'new',
      'acknowledged',
      'dismissed',
      'actioned',
    ];
    if (!validStatuses.includes(body.status)) {
      throw new BadRequestException(
        `status must be one of: ${validStatuses.join(', ')}`,
      );
    }
    return this.repo.updateAlertStatus(
      id,
      body.orgSlug,
      body.status,
      body.acknowledgedBy,
    );
  }

  // ── Pulse Trigger Helpers ────────────────────────────────────────────────

  /**
   * Sync a sentinel source to a Pulse cron trigger (best-effort).
   * Creates or updates the trigger to match the source's poll interval.
   */
  private async syncSourceTrigger(
    source: import('./sentinel.types').SentinelSource,
  ): Promise<void> {
    try {
      const result = await this.repo.upsertPulseTrigger(source);
      this.logger.log(
        `Synced Pulse trigger for source ${source.id}: triggerId=${result.triggerId} created=${result.created}`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to sync Pulse trigger for source ${source.id}: ${msg}`,
      );
    }
  }

  /**
   * Remove the Pulse cron trigger for a deleted source (best-effort).
   */
  private async deleteSourceTrigger(sourceId: string): Promise<void> {
    try {
      await this.repo.deletePulseTrigger(sourceId);
      this.logger.log(`Deleted Pulse trigger for source ${sourceId}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to delete Pulse trigger for source ${sourceId}: ${msg}`,
      );
    }
  }

  // ── RAG Helpers ────────────────────────────────────────────────────────

  /**
   * Ingest a portfolio holding into the sentinel-portfolio-{orgSlug} RAG
   * collection so it's searchable during alert evaluation.
   * Best-effort: logs warning on failure, never throws.
   */
  private async ingestHoldingToRag(
    orgSlug: string,
    holding: import('./sentinel.types').SentinelPortfolioHolding,
  ): Promise<void> {
    if (!this.ragStorage) return;

    try {
      const collectionSlug = `sentinel-portfolio-${orgSlug}`;

      let collection = await this.ragStorage.getCollectionBySlug(
        collectionSlug,
        orgSlug,
      );
      if (!collection) {
        collection = await this.ragStorage.createCollection(orgSlug, {
          name: `Sentinel Portfolio — ${orgSlug}`,
          slug: collectionSlug,
          description:
            'Portfolio holdings for sentinel cross-reference matching',
          embeddingModel: 'text-embedding-ada-002',
          embeddingDimensions: 1536,
          chunkSize: 1000,
          chunkOverlap: 200,
          createdBy: null,
          requiredRole: null,
          allowedUsers: null,
          complexityType: 'hybrid',
        });
      }

      // Build searchable text from holding fields
      const content = [
        `Client: ${holding.client_name}`,
        holding.matter_name ? `Matter: ${holding.matter_name}` : '',
        holding.practice_areas.length
          ? `Practice Areas: ${holding.practice_areas.join(', ')}`
          : '',
        holding.jurisdictions.length
          ? `Jurisdictions: ${holding.jurisdictions.join(', ')}`
          : '',
        holding.key_entities.length
          ? `Key Entities: ${holding.key_entities.join(', ')}`
          : '',
        holding.description ?? '',
      ]
        .filter(Boolean)
        .join('\n');

      const filename = `${holding.client_name} — ${holding.matter_name ?? 'General'}`;
      const doc = await this.ragStorage.insertDocument(collection.id, orgSlug, {
        filename,
        fileType: 'text/plain',
        fileSize: new TextEncoder().encode(content).length,
        fileHash: null,
        storagePath: null,
        createdBy: null,
        content,
      });

      // Update document content so it's indexed
      await this.ragStorage.updateDocumentContent(doc.id, orgSlug, content);

      this.logger.log(
        `Ingested holding ${holding.id} into RAG collection ${collectionSlug}`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to ingest holding ${holding.id} into RAG: ${msg}`,
      );
    }
  }
}
